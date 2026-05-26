import { Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";

@Controller("items")
export class ItemsController {
  @Post("/x")
  @UseGuards(AuthGuard)
  create() {
    return { ok: true };
  }
}
