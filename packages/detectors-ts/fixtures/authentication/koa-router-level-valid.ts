import Koa from "koa";
import Router from "@koa/router";

const app = new Koa();
const router = new Router();

function requireAuth(ctx: any, next: any) {
  if (!ctx.state.user) {
    ctx.throw(401, "Unauthorized");
  }
  return next();
}

router.post("/x", requireAuth, async (ctx) => {
  ctx.body = { ok: true };
});

app.use(router.routes());
