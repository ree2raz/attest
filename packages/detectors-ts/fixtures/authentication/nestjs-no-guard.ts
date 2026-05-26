import { Controller, Post } from "@nestjs/common";

@Controller("items")
export class ItemsController {
  @Post("/x")
  create() {
    return { ok: true };
  }
}
