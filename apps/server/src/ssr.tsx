import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { getRouterManifest } from "@tanstack/react-start/router-manifest";
import { getRouter } from "./router";

export default createStartHandler({
  getRouter,
  getRouterManifest,
})(defaultStreamHandler);
