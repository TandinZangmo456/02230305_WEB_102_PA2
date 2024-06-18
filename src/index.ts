// import the necessary Libaries
import { Hono } from "hono";
import { cors } from "hono/cors";
import { PrismaClient, Prisma } from "@prisma/client";
import { HTTPException } from "hono/http-exception";
import { sign } from "hono/jwt";
import axios from "axios";
import { jwt } from "hono/jwt";
import type { JwtVariables } from "hono/jwt";
import { rateLimiter } from "hono-rate-limiter";

type Variables = JwtVariables; // Defining the type of the variables to be used in the app

const app = new Hono<{ Variables: Variables }>();
const prisma = new PrismaClient();

app.use("/*", cors());

app.use(
  "/protected/*",
  jwt({
    secret: "mySecretKey",
  })
);

// Rate limiting
// Enable CORS for all routes
app.use("/*", cors());

// Create a rate limiter middleware
const limiter = rateLimiter({
  windowMs: 1 * 60 * 1000, // rate limiter for 1 minute
  limit: 2, // 2 requests per minute for each IP
  standardHeaders: "draft-6", // draft-6: RateLimit-* headers; draft-7: combined RateLimit header
  keyGenerator: (c) => c.req.header("X-Forwarded-For") || "default",
});

// Apply the rate limiting middleware to all requests
app.use(limiter);

// Initializing the end points
// endpoint for the registion
app.post("/register", async (c) => {
  const body = await c.req.json();
  const email = body.email;
  const password = body.password;

  const bcryptHash = await Bun.password.hash(password, {
    algorithm: "bcrypt", // The algorithm to use for hashing
    cost: 4, // The cost of the hash algorithm
  });

  try {
    // creating the user in the database using the email and password that is passed in the body
    const user = await prisma.user.create({
      data: {
        email: email,
        hashedPassword: bcryptHash,
      },
    });

    // returning the message that if the user is created successfully not and
    //if it is created earlier then it will return the message that email already exists
    return c.json({ message: `${user.email} is created successfully` });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return c.json({ message: " This Email already exists" });
      }
    }
    // if the user is not created successfully then it will return the message that internal server error
    throw new HTTPException(500, {
      message: "There Is A Internal Server Error",
    });
  }
});

// endpoint for the login page to authencate the user
app.post("/login", async (c) => {
  try {
    // passing the email and password to the body for login
    const body = await c.req.json();
    const email = body.email;
    const password = body.password;

    // fetching the user information from the database using email
    const user = await prisma.user.findUnique({
      where: { email: email },
      select: { id: true, hashedPassword: true },
    });

    if (!user) {
      return c.json({ message: "User not found" }, 404);
    }

    const match = await Bun.password.verify(
      password,
      user.hashedPassword,
      "bcrypt"
    );

    if (match) {
      const payload = {
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 60 * 5, // Token expires in 5 minutes
      };
      const secret = "mySecretKey";
      const token = await sign(payload, secret); // Await the sign function

      if (typeof token !== "string") {
        console.error("Token signing failed", token);
        throw new HTTPException(500, { message: "Token signing failed" });
      }

      return c.json({ message: "Login successful", token: token });
    } else {
      throw new HTTPException(401, { message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error);
    if (error instanceof HTTPException) {
      throw error;
    } else {
      throw new HTTPException(500, {
        message: "There Is A Internal Server Error",
      });
    }
  }
});

// end point for the pokemon name
app.get("/pokemon/:name", async (c) => {
  const { name } = c.req.param();

  try {
    // fetching the pokemon informations  from the api using the name of the pokemon using axios library
    const response = await axios.get(
      `https://pokeapi.co/api/v2/pokemon/${name}`
    );
    return c.json({ data: response.data });
    // if the pokemon is not found then it will return the message that pokemon is not found..
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response && error.response.status === 404) {
        return c.json({ message: "Your Pokémon was not found!" }, 404);
      }
      return c.json(
        { message: "An error occurred while fetching the Pokémon data" },
        500
      );
    } else {
      return c.json({ message: "An unexpected error occurred" }, 500);
    }
  }
});

// endpoint to catch pokemon and save it to the database
app.post("/pokemon/catch", async (c) => {
  try {
    // fetching the payload from the jwt token which we get while we login
    const payload = c.get("jwtPayload");
    if (!payload) {
      throw new HTTPException(401, { message: "YOU ARE UNAUTHORIZED" });
    }

    // fetching the pokemon name from the body
    const body = await c.req.json();
    const pokemonName = body.name;

    // if the pokemon name is not found then it will return the message that pokemon name is required
    if (!pokemonName) {
      throw new HTTPException(400, { message: "Pokemon name is required" });
    }

    let pokemon = await prisma.pokemon.findUnique({
      where: { name: pokemonName },
    });

    if (!pokemon) {
      pokemon = await prisma.pokemon.create({
        data: { name: pokemonName },
      });
    }

    const caughtPokemon = await prisma.caughtPokemon.create({
      data: {
        userId: payload.sub,
        pokemonId: pokemon.id,
      },
    });

    return c.json({ message: "Pokemon caught", data: caughtPokemon });
  } catch (error) {
    console.error(error);
    if (error instanceof HTTPException) {
      throw error;
    } else {
      throw new HTTPException(500, { message: "Internal Server Error" });
    }
  }
});

// endpoint to release the pokemon from the database
app.delete("/pokemon/delete/:id", async (c) => {
  const payload = c.get("jwtPayload");
  if (!payload) {
    throw new HTTPException(401, { message: "YOU ARE UNAUTHORIZED" });
  }

  const { id } = c.req.param();

  try {
    const deleteResult = await prisma.caughtPokemon.deleteMany({
      where: { id: id, userId: payload.sub },
    });

    if (deleteResult.count === 0) {
      return c.json({ message: "Pokemon not found or not owned by user" }, 404);
    }

    return c.json({ message: "Pokemon is released" });
  } catch (error: unknown) {
    return c.json(
      { message: "An error occurred while releasing the Pokemon" },
      500
    );
  }
});

// endpoint to get the list of the caught pokemons
app.get("/pokemon/caught", async (c) => {
  const payload = c.get("jwtPayload");
  if (!payload) {
    throw new HTTPException(401, { message: "YOU ARE UNAUTHORIZED" });
  }

  try {
    const caughtPokemon = await prisma.caughtPokemon.findMany({
      where: { userId: payload.sub },
      include: { pokemon: true },
    });

    if (!caughtPokemon.length) {
      return c.json({ message: "Your Pokémon Not found." });
    }

    return c.json({ data: caughtPokemon });
  } catch (error: unknown) {
    console.error("Error fetching caught Pokémon:", error);
    return c.json(
      { message: "An error occurred while fetching caught Pokémon details" },
      500
    );
  }
});

export default app;