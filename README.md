Notes on the New Authentication Test Sequence

This test sequence validates the new JWT and Firestore-based authentication logic implemented in server.js.

1. Registration (/api/user/register)

Action: This is now a two-part process:

Calls the Go Connector (as an Admin) to register the identity on the Fabric ledger.

Hashes the password and saves the credentials (userId and hashed_password) to the Firestore users collection.

Goal: Set up both the blockchain identity and the web authentication credentials.

2. Login and Token Capture (/api/auth/login)

Action: The request sends the username and password. The backend verifies the hash against Firestore.

Token Capture: We use special syntax (@name capture_... and @... = {{...}}) available in REST client tools to automatically extract the returned token from the JSON response body.

Variable Usage: The captured JWTs are saved to:

{{patient_token}}

{{doctor_token}}

These tokens are then used in the Authorization header for all subsequent protected API calls.

3. Protected Routes (e.g., /api/consent/grant, /api/record/add)

Header: All protected routes now require: Authorization: Bearer {{TOKEN}}.

Backend Logic (authenticateToken): The middleware does the following:

Verifies the JWT is valid and unexpired.

Extracts the user's Fabric ID (e.g., patient01) from the token payload.

Attaches this ID to the request object (req.user.fabric_id).

Transaction Submission: The API endpoint (e.g., /api/consent/grant) then uses req.user.fabric_id to dynamically call submitTransaction(...), ensuring the transaction is signed with the correct user's private key.

This setup ensures that unauthorized users without a token are blocked immediately, and authenticated users are still checked by the chaincode for permissioning (as seen in Test Case 12).