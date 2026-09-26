from pydantic import BaseModel, EmailStr

from backend.app.models.user import Role


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role