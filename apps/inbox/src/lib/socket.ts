"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { io, type Socket } from "socket.io-client";

import { API_PREFIX } from "./constants";

let socket: Socket | null = null;

export function connect() {
  socket ??= io(API_ENDPOINTS.EVENTS, {
    path: `${API_PREFIX}/socket.io`,
    withCredentials: true,
    addTrailingSlash: false,
  });
  return socket;
}
