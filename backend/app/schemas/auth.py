from pydantic import BaseModel, EmailStr,Field

from backend.app.models.user import Role


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: Role

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role

class RoleUpdateRequest(BaseModel):
    role: Role