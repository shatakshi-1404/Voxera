from app.core.config import settings


def make_livekit_token(room: str, identity: str, name: str) -> str:
    """Short-lived join token minted server-side. The API secret never reaches the browser."""
    from livekit import api

    return (api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
            .with_identity(identity).with_name(name)
            .with_ttl(__import__("datetime").timedelta(minutes=15))
            .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True))
            .to_jwt())
