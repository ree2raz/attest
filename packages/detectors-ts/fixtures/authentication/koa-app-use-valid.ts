import Koa from "koa";
import Router from "@koa/router";

const app = new Koa();
const router = new Router();

function authMiddleware(ctx: any, next: any) {
  if (!ctx.headers.authorization) {
    ctx.throw(401, "Unauthorized");
  }
  return next();
}

app.use(authMiddleware);

router.post("/x", async (ctx) => {
  ctx.body = { ok: true };
});

app.use(router.routes());
