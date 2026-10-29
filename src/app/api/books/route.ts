import { badRequest } from "@/lib/http/errors";
import { route } from "@/lib/http/route";
import { listBookRowsByAuthor, toBook } from "@/lib/repositories/books";

// Authors: always their own books. Admins: must say whose via ?authorId=.
export const GET = route({}, async ({ req, session }) => {
  const authorId = session.role === "author" ? session.authorId! : req.nextUrl.searchParams.get("authorId");
  if (!authorId) throw badRequest("authorId query parameter is required for admins");
  return (await listBookRowsByAuthor(authorId)).map(toBook);
});
