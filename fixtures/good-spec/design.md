# Good Specification - Design

## Data Model

The system stores user accounts, authentication tokens, and user-generated data in a relational database.

### Schema

**users table:**
- id (UUID, primary key)
- email (VARCHAR, unique, not null)
- password_hash (VARCHAR, not null)
- name (VARCHAR, not null)
- profile_picture_url (VARCHAR, nullable)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**sessions table:**
- id (UUID, primary key)
- user_id (UUID, foreign key → users.id)
- token (VARCHAR, unique, not null)
- created_at (TIMESTAMP)
- expires_at (TIMESTAMP)

**password_reset_tokens table:**
- id (UUID, primary key)
- user_id (UUID, foreign key → users.id)
- token (VARCHAR, unique, not null)
- created_at (TIMESTAMP)
- expires_at (TIMESTAMP)

**user_data table:**
- id (UUID, primary key)
- user_id (UUID, foreign key → users.id, not null)
- content (TEXT, not null)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

### Relationships

- One user has many sessions (1:N)
- One user has many password reset tokens (1:N)
- One user has many data records (1:N)

## Error Handling

The system implements graceful error handling at multiple levels:

### Request Validation
- All incoming requests are validated against schema
- Invalid requests return HTTP 400 with descriptive error message
- Request size limits enforced (max 10MB)

### Authentication Errors
- Invalid credentials return HTTP 401 "Unauthorized"
- Expired tokens return HTTP 401 with "Session expired" message
- Missing authentication header returns HTTP 401 with "Authentication required"

### Database Errors
- Connection failures trigger automatic retry (max 3 attempts with exponential backoff)
- Timeout errors after 30 seconds return HTTP 504 "Gateway Timeout"
- Constraint violations return HTTP 400 with violation details (e.g., "Email already exists")

### Server Errors
- Unhandled exceptions are caught and logged with stack trace
- Clients receive HTTP 500 "Internal Server Error" with request ID for support
- Clients never receive sensitive internal error details

### Error Response Format
```json
{
  "status": "error",
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "requestId": "unique-request-id",
  "timestamp": "ISO-8601 timestamp"
}
```

## API Contracts

### Authentication Endpoints

**POST /api/auth/login**
- Request: `{ email: string, password: string }`
- Response (success): `{ status: "success", sessionToken: string, expiresIn: number }`
- Response (failure): HTTP 401 with error details

**POST /api/auth/logout**
- Request: Headers include `Authorization: Bearer <token>`
- Response: `{ status: "success", message: "Logged out" }`

**POST /api/auth/reset-password**
- Request: `{ email: string }`
- Response: `{ status: "success", message: "Reset link sent to email" }`

### Profile Endpoints

**GET /api/user/profile**
- Request: Headers include `Authorization: Bearer <token>`
- Response: `{ id, email, name, profilePictureUrl, createdAt }`

### Export Endpoints

**GET /api/export/csv**
- Request: Headers include `Authorization: Bearer <token>`
- Response: CSV file with MIME type `text/csv`

### Search Endpoints

**GET /api/search?q=query&limit=10&offset=0**
- Request: Query parameters include search term and pagination
- Request: Headers include `Authorization: Bearer <token>`
- Response: `{ status: "success", results: [{ id, content, matchScore }], total: number }`

All endpoints require HTTPS and include CORS headers for browser-based clients.
