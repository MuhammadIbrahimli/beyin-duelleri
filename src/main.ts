import "./styles.css";
import { session } from "./api";
import { initPwa } from "./pwa";
import { route, startRouter } from "./router";
import { duelResult, home, intro, invite, invitePage, play, result } from "./screens";

route("/", () => home());
route("/e/:slug", (c) => intro(c.params.slug));
route("/play/:slug", (c) => play(c.params.slug, c.query));
route("/result", () => result());
route("/invite", (c) => invite(c.query));
route("/d/:code", (c) => invitePage(c.params.code));
route("/duel/:code", (c) => duelResult(c.params.code));
route("/qrupla", () => import("./qrupla").then((q) => q.qrupla()));
route("/duels", () => import("./screens-more").then((m) => m.duelsTab()));
route("/ranking", () => import("./screens-more").then((m) => m.ranking()));
route("/passport", () => import("./screens-more").then((m) => m.passport()));
route("/admin", () => import("./screens-admin").then((x) => x.admin()));
route("/privacy", () => import("./screens-more").then((m) => m.privacy()));

initPwa();
session().catch(() => {}).finally(startRouter);
