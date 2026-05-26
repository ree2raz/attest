import { Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("items")
@UseGuards(JwtAuthGuard)
export class ItemsController {
  @Post("/x")
  create() {
    return { ok: true };
  }
}
