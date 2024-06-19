Pokémon API

The project is an API for Pokémon powered by the Hono framework for Go and Bun runtime. It has user login functionality, fetching new Pokémon, catching Pokémon, and releasing Pokémon capability.

API Endpoints
Register a User
Method: POST

URL: /register

Body:
{
  "email": "tandin@example.com",
  "password": "yourpassword"
}

Login a User
Method: POST

URL: /login

Body:
{
  "email": "user@example.com",
  "password": "yourpassword"
}

Response:
{
  "message": "Login successful",
  "token": "your_jwt_token"
}

Fetch Pokémon Data
Method: GET
URL: /pokemon/:name
Catch a Pokémon
Method: POST

URL: /protected/pokemon/catch

Headers:

Authorization: Bearer <your_token>
Body:

{
  "name": "pikachu"
}

Release a Pokémon
Method: DELETE
URL: /protected/pokemon/delete/:id
Headers:
Authorization: Bearer <your_token>
List Caught Pokémon
Method: GET
URL: /protected/pokemon/caught
Headers:
Authorization: Bearer <your_token>
Testing with Postman
Register a new user:

Method: POST

URL: http://localhost:3001/register

Body:
{
  "email": "user@example.com",
  "password": "yourpassword"
}

Login to get JWT token:

Method: POST

URL: http://localhost:3001/login

Body:
{
  "email": "tandin@example.com",
  "password": "yourpassword"
}

Catch a Pokémon:

Method: POST

URL: http://localhost:3001/protected/pokemon/catch

Headers: Authorization: Bearer <your_token>

Body:
{
  "name": "pikachu"
}
List caught Pokémon:

Method: GET
URL: http://localhost:3001/protected/pokemon/caught
Headers: Authorization: Bearer <your_token>
Release a Pokémon:

Method: DELETE
URL: http://localhost:3001/protected/pokemon/delete/:id
Headers: Authorization: Bearer <your_token>
