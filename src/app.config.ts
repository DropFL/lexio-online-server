import { GameRoom } from "./rooms/MyRoom.js";
import { LobbyRoom } from "colyseus";
import { auth } from "@colyseus/auth";
import config from "@colyseus/tools";
import { monitor } from "@colyseus/monitor";
import { playground } from "@colyseus/playground";

// if (process.env.NODE_ENV === "production") {
//   auth.backend_url = "https://your-game.io";
// } else {
auth.backend_url = "http://localhost:2567";
// }

auth.oauth.addProvider("kakao", {
  key: "2691f4097f4dcaf2379459ae30efaad2",
  secret: "IRsFbvLvTArFzSlSLzXvzN3RXcOzdG33",
  scope: ["openid"],
  // 카카오 로그인에는 redirect_uri가 필수임
  // @ts-ignore
  redirect_uri: "http://localhost:2567/auth/provider/kakao/callback",
});

auth.oauth.onCallback(async (data, provider) => {
  console.log("OAuth callback");
  console.log(data);
  console.log(provider);
  console.log(data.jwt);
});

export default config({
  initializeGameServer: (gameServer) => {
    gameServer.define("lobby", LobbyRoom);
    gameServer.define("my_room", GameRoom);
  },

  initializeExpress: (app) => {
    // app.get("/hello_world", (req, res) => {
    //   res.send("It's time to kick ass and chew bubblegum!");
    // });

    if (process.env.NODE_ENV !== "production") {
      app.use("/", playground());
    }

    app.use("/monitor", monitor());
    app.use(auth.prefix, auth.routes());
  },

  beforeListen: () => {},
});
