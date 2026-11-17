import "./styles.css";
import { session } from "./api";
import { route, startRouter } from "./router";
import { duelResult, home, intro, invite, invitePage, play, result, soon } from "./screens";

route("/", () => home());
route("/e/:slug", (c) => intro(c.params.slug));
route("/play/:slug", (c) => play(c.params.slug, c.query));
route("/result", () => result());
route("/invite", (c) => invite(c.query));
route("/d/:code", (c) => invitePage(c.params.code));
route("/duel/:code", (c) => duelResult(c.params.code));
route("/soon", () => soon());

session().catch(() => {}).finally(startRouter);
