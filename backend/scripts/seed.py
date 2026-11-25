"""Seeds a demo org with synthetic customers, orders, policies and history.
Run from backend/:  python -m scripts.seed"""
import asyncio
import datetime as dt
import random

from sqlalchemy import select, text

from app.agents.graph import DEFAULT_PROMPT
from app.core.db import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import (AgentConfig, Conversation, Customer, CustomerIdentity, Document, Escalation, Feedback, Membership, Message,
                        Order, OrderItem, Organization, Payment, Shipment, User, now)
from app.rag import service as rag

POLICIES = {
    ("Return and Refund Policy", "policy"): """Return and Refund Policy

Customers may return most products within 30 days of delivery for a full refund. Items must be unused and in original packaging.

Returns requested after 30 days of delivery are not eligible for a refund, but may qualify for store credit at the discretion of support.

Refund requests above INR 5000 require manual review by a human support agent. Approved refunds are returned to the original payment method within 5 to 7 business days.

Digital goods, gift cards and personalised items cannot be returned.""",
    ("Shipping Policy", "policy"): """Shipping Policy

Standard shipping takes 3 to 5 business days. Express shipping takes 1 to 2 business days. Orders above INR 999 ship free.

If a shipment is delayed, customers can ask support to create a priority ticket. Delays caused by weather or regional distribution center congestion usually resolve within 48 hours.

Orders marked delivered but not received should be reported within 7 days of the delivery date.""",
    ("Cancellation Policy", "policy"): """Cancellation Policy

Orders can be cancelled free of charge while the status is processing. Once an order has shipped it can no longer be cancelled; customers may return it after delivery instead.

Cancelled prepaid orders are refunded to the original payment method within 5 to 7 business days.""",
    ("Warranty and Product FAQ", "faq"): """Warranty and Product FAQ

All electronics carry a 12 month manufacturer warranty covering defects. Accidental damage and water damage are not covered.

To claim warranty, contact support with your order number and a photo of the defect. Replacement units ship within 3 business days of approval.""",
}


async def main():
    async with engine.begin() as c:
        await c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await c.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        if (await db.execute(select(Organization).where(Organization.slug == "demo"))).scalar_one_or_none():
            print("Demo org already exists. Drop the DB volume to reseed.")
            return
        org = Organization(name="Demo Store", slug="demo")
        db.add(org)
        await db.flush()
        staff = [("admin@voxera.dev", "Asha Admin", "owner"), ("manager@voxera.dev", "Manoj Manager", "manager"),
                 ("agent@voxera.dev", "Aarav Agent", "agent"), ("analyst@voxera.dev", "Anita Analyst", "analyst")]
        for email, name, role in staff:
            u = User(email=email, password_hash=hash_password("Voxera@123"), full_name=name)
            db.add(u)
            await db.flush()
            db.add(Membership(user_id=u.id, org_id=org.id, role=role))
        db.add(AgentConfig(org_id=org.id, system_prompt=DEFAULT_PROMPT, tools_enabled=["orders", "refunds", "tickets", "knowledge"],
                           escalation_rules={"max_failed_verifications": 3, "refund_auto_limit": 5000}))

        people = [("Ananya Sharma", "ananya@example.com", "+919876504821", "en"), ("Rahul Mehta", "rahul@example.com", "+919812307755", "hinglish"),
                  ("Priya Verma", "priya@example.com", "+919900112233", "en"), ("Vikram Singh", "vikram@example.com", "+919811144402", "hi")]
        custs = []
        for name, email, phone, lang in people:
            c = Customer(org_id=org.id, name=name, email=email, phone=phone, language=lang, tags=["vip"] if name.startswith("Ananya") else [])
            db.add(c)
            await db.flush()
            db.add_all([CustomerIdentity(org_id=org.id, customer_id=c.id, kind="email", value=email),
                        CustomerIdentity(org_id=org.id, customer_id=c.id, kind="phone", value=phone)])
            custs.append(c)

        def order(c, code, status, total, items, ship, days_ago, pay_last4="4242", delay=None, delivered_days_ago=None):
            o = Order(org_id=org.id, customer_id=c.id, code=code, status=status, total=total, placed_at=now() - dt.timedelta(days=days_ago))
            o.items = [OrderItem(name=n, quantity=q, price=pr) for n, q, pr in items]
            o.shipment = Shipment(tracking_no=f"BD{code[-5:]}IN", status=ship, carrier="BlueDart",
                                  expected_delivery=(now() + dt.timedelta(days=1)).date() if ship in ("delayed", "in_transit") else None,
                                  last_location="Regional Distribution Center, Nagpur" if ship == "delayed" else None, delay_reason=delay,
                                  delivered_at=now() - dt.timedelta(days=delivered_days_ago) if delivered_days_ago is not None else None)
            o.payment = Payment(org_id=org.id, method="card", brand="Visa", last4=pay_last4, status="paid" if status != "cancelled" else "refunded", amount=total)
            db.add(o)

        a, r, p, v = custs
        order(a, "VX-10284", "shipped", 2499, [("Wireless Earbuds", 1, 2499)], "delayed", 6, delay="Regional distribution center congestion")
        order(a, "VX-10190", "delivered", 1299, [("Phone Case", 2, 649.5)], "delivered", 20, delivered_days_ago=12)
        order(a, "VX-10002", "delivered", 8999, [("Smart Watch", 1, 8999)], "delivered", 60, delivered_days_ago=50)
        order(r, "VX-10301", "processing", 1799, [("Backpack", 1, 1799)], "label_created", 1)
        order(r, "VX-10255", "delivered", 3499, [("Running Shoes", 1, 3499)], "delivered", 9, delivered_days_ago=4)
        order(p, "VX-10310", "shipped", 999, [("Desk Lamp", 1, 999)], "in_transit", 2, pay_last4="1881")
        order(v, "VX-10120", "delivered", 12999, [("Bluetooth Speaker", 1, 12999)], "delivered", 15, delivered_days_ago=10)

        for (title, cat), text_ in POLICIES.items():
            d = Document(org_id=org.id, title=title, category=cat, filename=f"{title.lower().replace(' ', '-')}.md")
            db.add(d)
            await db.flush()
            await rag.ingest(db, d, text_)

        # historical conversations so analytics has shape
        random.seed(7)
        intents = ["order_status", "order_status", "refund_request", "policy_question", "payment_issue", "cancel_order", "human_request"]
        for i in range(60):
            created = now() - dt.timedelta(days=random.randint(0, 13), hours=random.randint(0, 20))
            c = random.choice(custs)
            esc = random.random() < 0.18
            ch = random.choices(["chat", "voice"], [0.75, 0.25])[0]
            conv = Conversation(org_id=org.id, customer_id=c.id, candidate_customer_id=c.id, channel=ch, verified=True,
                                language=random.choices(["en", "hi", "hinglish"], [0.6, 0.15, 0.25])[0], last_intent=random.choice(intents),
                                status="resolved", resolved_by="human" if esc else "ai", handler="human" if esc else "ai",
                                created_at=created, first_response_at=created + dt.timedelta(seconds=random.randint(2, 9)),
                                resolved_at=created + dt.timedelta(minutes=random.randint(2, 40)), last_message_at=created, subject="Where is my order?")
            db.add(conv)
            await db.flush()
            db.add(Message(org_id=org.id, conversation_id=conv.id, role="customer", content="Where is my order?", created_at=created))
            if esc:
                db.add(Escalation(org_id=org.id, conversation_id=conv.id, reason="Customer asked for a human", status="resolved", created_at=created))
            if random.random() < 0.6:
                db.add(Feedback(org_id=org.id, conversation_id=conv.id, customer_id=c.id, rating=random.choices([5, 4, 3, 2, 1], [45, 30, 12, 8, 5])[0], created_at=created))
        await db.commit()
    print("Seeded. Staff login: admin@voxera.dev / Voxera@123  (also manager@, agent@, analyst@)")
    print("Org slug for the public chat widget: demo | Test customer: ananya@example.com, phone ends 4821")


if __name__ == "__main__":
    asyncio.run(main())
