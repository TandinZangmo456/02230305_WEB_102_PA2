import { Hono } from "hono";
import { cors } from "hono/cors";
import { PrismaClient, Prisma } from "@prisma/client";
import { HTTPException } from "hono/http-exception";
import { sign } from "hono/jwt";
import axios from "axios";
import { jwt } from "hono/jwt";
import type { JwtVariables } from "hono/jwt";
import { rateLimiter } from "hono-rate-limiter";

type Variables = JwtVariables;

const app = new Hono<{ Variables: Variables }>();
const prisma = new PrismaClient();

app.use("/*", cors());

const limiter = rateLimiter({
  windowMs: 1 * 60 * 1000,
  limit: 2,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.req.header("X-Forwarded-For") || "default",
});

app.use(limiter);

app.use(
  "/protected/*",
  jwt({
    secret: "mySecretKey",
  })
);

app.post("/register", async (c) => {
  const body = await c.req.json();
  const email = body.email;
  const password = body.password;

  const bcryptHash = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  try {
    const user = await prisma.user.create({
      data: {
        email: email,
        hashedPassword: bcryptHash,
      },
    });

    return c.json({ message: `${user.email} is created successfully` });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return c.json({ message: "This email already exists" });
      }
    }
    throw new HTTPException(500, {
      message: "There is an internal server error",
    });
  }
});

app.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const email = body.email;
    const password = body.password;

    const user = await prisma.user.findUnique({
      where: { email: email },
      select: { id: true, hashedPassword: true },
    });

    if (!user) {
      return c.json({ message: "User not found" }, 404);
    }

    const match = await Bun.password.verify(password, user.hashedPassword, "bcrypt");

    if (match) {
      const payload = {
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 60 * 5,
      };
      const secret = "mySecretKey";
      const token = await sign(payload, secret);

      return c.json({ message: "Login successful", token: token });
    } else {
      throw new HTTPException(401, { message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error);
    throw new HTTPException(500, {
      message: "There is an internal server error",
    });
  }
});

app.get("/pokemon/:name", async (c) => {
  const { name } = c.req.param();

  try {
    const response = await axios.get(`https://pokeapi.co/api/v2/pokemon/${name}`);
    return c.json({ data: response.data });
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

app.post("/protected/pokemon/catch", async (c) => {
  try {
    const payload = c.get("jwtPayload");
    if (!payload) {
      throw new HTTPException(401, { message: "You are unauthorized" });
    }

    const body = await c.req.json();
    const pokemonName = body.name;

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
    throw new HTTPException(500, { message: "Internal server error" });
  }
});

app.delete("/protected/pokemon/delete/:id", async (c) => {
  const payload = c.get("jwtPayload");
  if (!payload) {
    throw new HTTPException(401, { message: "You are unauthorized" });
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

app.get("/protected/pokemon/caught", async (c) => {
  const payload = c.get("jwtPayload");
  if (!payload) {
    throw new HTTPException(401, { message: "You are unauthorized" });
  }

  try {
    const caughtPokemon = await prisma.caughtPokemon.findMany({
      where: { userId: payload.sub },
      include: { pokemon: true },
    });

    if (!caughtPokemon.length) {
      return c.json({ message: "Your Pokémon not found." });
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

Bun.serve({
  fetch: app.fetch,
  port: 3001,
  hostname: "localhost",
  development: true,
});
