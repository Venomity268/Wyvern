import { getIronSession } from "iron-session";
import { IncomingMessage, ServerResponse } from "http";
import { SessionData, SessionUser, getSessionOptions } from "./session-options";

function dummyResponse(): ServerResponse {
  return {
    getHeader: () => undefined,
    setHeader: () => {},
    headersSent: false,
  } as unknown as ServerResponse;
}

export async function getSessionUserFromRequest(
  req: IncomingMessage,
): Promise<SessionUser | null> {
  const session = await getIronSession<SessionData>(
    req,
    dummyResponse(),
    getSessionOptions(),
  );
  if (!session.isLoggedIn || !session.user) return null;
  return session.user;
}
