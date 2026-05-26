import Koa from "koa";
import Router from "@koa/router";

const app = new Koa();
const router = new Router();

router.post("/x", async (ctx) => {
  ctx.body = { data: "unprotected" };
});

app.use(router.routes());
