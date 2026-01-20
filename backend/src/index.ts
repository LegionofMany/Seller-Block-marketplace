import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT) || 4000;

const server = app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

export default server;