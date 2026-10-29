import { query, queryOne } from "../db";
import type { Book } from "../types";

export interface BookRow {
  id: string; author_id: string; title: string; isbn: string | null; genre: string | null;
  publication_date: string | null; status: string; mrp: number | null;
  author_royalty_per_copy: number | null; total_copies_sold: number; total_royalty_earned: number;
  royalty_paid: number; royalty_pending: number; last_royalty_payout_date: string | null;
  print_partner: string | null; available_on: string[];
}

// Select dates as plain YYYY-MM-DD strings so they don't shift with server timezone.
const COLS = `id, author_id, title, isbn, genre,
  to_char(publication_date,'YYYY-MM-DD') AS publication_date, status, mrp, author_royalty_per_copy,
  total_copies_sold, total_royalty_earned, royalty_paid, royalty_pending,
  to_char(last_royalty_payout_date,'YYYY-MM-DD') AS last_royalty_payout_date, print_partner, available_on`;

export const toBook = (r: BookRow): Book => ({
  id: r.id,
  title: r.title,
  isbn: r.isbn,
  genre: r.genre,
  publicationDate: r.publication_date,
  status: r.status,
  mrp: r.mrp,
  totalCopiesSold: r.total_copies_sold,
  totalRoyaltyEarned: r.total_royalty_earned,
  royaltyPaid: r.royalty_paid,
  royaltyPending: r.royalty_pending,
  lastRoyaltyPayoutDate: r.last_royalty_payout_date,
  printPartner: r.print_partner,
  availableOn: r.available_on,
  isPublished: r.status.startsWith("Published"),
});

export const listBookRowsByAuthor = (authorId: string) =>
  query<BookRow>(`SELECT ${COLS} FROM books WHERE author_id=$1 ORDER BY publication_date NULLS LAST, id`, [authorId]);

export const getBookRow = (bookId: string) =>
  queryOne<BookRow>(`SELECT ${COLS} FROM books WHERE id=$1`, [bookId]);
