import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

import productRoutes from "./routes/productRoutes.js";

import {aj} from "./lib/arcjet.js"

// Load .env variables
dotenv.config();

// Set up the Neon SQL client
const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;
export const sql = neon(
  `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}/${PGDATABASE}?sslmode=require&channel_binding=require`
);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));


app.use(async (req, res, next) => {
    try {
        const decision = await aj.protect(req, { request: 1 });

        if (decision.isDenied()) {
            if (decision.reason.isRateLimit) {
                res.status(429).json({ error: "Too many requests" });
            } else if (decision.reason.isBot()) {
                res.status(403).json({ error: "Bot access denied" });
            } else {
                res.status(403).json({ error: "Forbidden" });
            }
            return;
        }

        // GUARD - verifici că result este array
        if (
            Array.isArray(decision.result) &&
            decision.result.some(
                (result) =>
                    result.reason.isBot && // E funcție? altfel folosește result.reason.isBot()
                    result.reason.isSpoofed &&
                    result.reason.isBot() &&
                    result.reason.isSpoofed()
            )
        ) {
            res.status(403).json({ error: "Spoofed bot detected" });
            return;
        }

        next();
    } catch (error) {
        console.log("Error in middleware", error);
        next(error);
    }
});
// Route setup
app.use("/api/products", productRoutes);

async function initDB() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS products(
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        image VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database initialized");
  } catch (error) {
    console.log("Error initDB", error);
  }
}

// Run DB init then start server
initDB().then(() =>
  app.listen(PORT, () => {
    console.log("Running on port " + PORT);
  })
);