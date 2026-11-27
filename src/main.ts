import "./styles.css";
import { session } from "./api";
import { initPwa } from "./pwa";
import { go, route, startRouter } from "./router";
import { category, duelResult, home, intro, invite, invitePage, play, result } from "./screens";

route("/", () => import("./duel5").then((d) => d.duelHome()));
// the experiments catalogue is reached from the home screen (Məşq et)
route("/train", () => home());
route("/match/search", (c) => import("./duel5").then((d) => d.duelSearch(c.query.get("rematch"))));
route("/shop", () => import("./game2").then((g) => g.shopPage()));
route("/marafon", () => import("./game2").then((g) => g.marafonPage()));
route("/leaderboard", (c) => import("./game2").then((g) => g.boardPage(c.query.get("tab") ?? "rating", c.query.get("scope") ?? "world", Number(c.query.get("page")) || 1)));
route("/friends", () => import("./game2").then((g) => g.friendsPage()));
route("/daily-board", (c) => import("./game3").then((g) => g.dailyBoardPage(c.query.get("scope") ?? "world")));
route("/admin-duel", () => import("./game3").then((g) => g.adminPage()));
route("/teams", () => import("./game2").then((g) => g.teamsPage()));
route("/teams/:id", (c) => import("./game2").then((g) => g.teamPage(c.params.id)));
route("/profile", () => import("./game2").then((g) => g.profilePage()));
route("/e/:slug", (c) => intro(c.params.slug));
route("/play/:slug", (c) => play(c.params.slug, c.query));
route("/c/:id", (c) => category(c.params.id));
route("/result", () => result());
route("/invite", (c) => invite(c.query));
route("/d/:code", (c) => invitePage(c.params.code));
route("/duel/:code", (c) => duelResult(c.params.code));
route("/qrupla", () => import("./qrupla").then((q) => q.qrupla()));
route("/duels", () => import("./screens-more").then((m) => m.duelsTab()));
// the live games now live on the duels page; old links land there
route("/live", () => go("/duels", true));
route("/r/:code", (c) => import("./room").then((m) => m.roomPage(c.params.code)));
route("/g/:code", (c) => import("./screens-more").then((x) => x.groupPage(c.params.code)));
route("/ranking", () => import("./screens-more").then((m) => m.ranking()));
route("/passport", () => import("./screens-more").then((m) => m.passport()));
route("/admin", () => import("./screens-admin").then((x) => x.admin()));
route("/privacy", () => import("./screens-more").then((m) => m.privacy()));

initPwa();
session().catch(() => {}).finally(startRouter);
