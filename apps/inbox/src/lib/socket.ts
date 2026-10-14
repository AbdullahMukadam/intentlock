"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";

import { API_PREFIX } from "./constants";
import type { EventName } from "./enums/event-name.enum";

let socket: Socket | null = null;

function connect() {
  socket ??= io(API_ENDPOINTS.EVENTS, {
    path: `${API_PREFIX}/socket.io`,
    withCredentials: true,
    addTrailingSlash: false,
  });
  return socket;
}

export function useEvents(names: EventName[], onEvent: () => void, everyMs?: number) {
  const key = names.join(",");
  useEffect(() => {
    const s = connect();
    const events = key.split(",");
    for (const name of events) s.on(name, onEvent);
    s.on("connect", onEvent);
    const timer = everyMs ? setInterval(onEvent, everyMs) : undefined;
    return () => {
      for (const name of events) s.off(name, onEvent);
      s.off("connect", onEvent);
      clearInterval(timer);
    };
  }, [key, onEvent, everyMs]);
}
