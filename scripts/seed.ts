import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { closePool, withTransaction } from "../src/lib/db";

// Demo credentials, documented in the README. Rotate before any real use.
const AUTHOR_PASSWORD = "Author@123";
const ADMINS = [
  { email: "admin@bookleaf.in", name: "Ops Admin" },
  { email: "support@bookleaf.in", name: "Support Lead" },
];
const ADMIN_PASSWORD = "Admin@123";

interface SeedBook {
  book_id: string; title: string; isbn: string | null; genre: string | null;
  publication_date: string | null; status: string; mrp: number | null;
  author_royalty_per_copy: number | null; total_copies_sold: number;
  total_royalty_earned: number; royalty_paid: number; royalty_pending: number;
  last_royalty_payout_date: string | null; print_partner: string | null; available_on: string[];
}
interface SeedAuthor {
  author_id: string; name: string; email: string; phone: string; city: string;
  joined_date: string; books: SeedBook[];
}

async function main() {
  const { authors } = JSON.parse(
    readFileSync(join(process.cwd(), "data", "bookleaf_sample_data.json"), "utf8"),
  ) as { authors: SeedAuthor[] };

  const authorHash = await bcrypt.hash(AUTHOR_PASSWORD, 10);
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await withTransaction(async (c) => {
    for (const a of authors) {
      await c.query(
        `INSERT INTO authors (id, name, email, phone, city, joined_date)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name=$2, email=$3, phone=$4, city=$5, joined_date=$6`,
        [a.author_id, a.name, a.email, a.phone, a.city, a.joined_date],
      );
      // Don't clobber a changed password on re-seed.
      await c.query(
        `INSERT INTO users (email, password_hash, role, name, author_id)
         VALUES ($1,$2,'author',$3,$4) ON CONFLICT (email) DO NOTHING`,
        [a.email, authorHash, a.name, a.author_id],
      );
      for (const b of a.books) {
        await c.query(
          `INSERT INTO books (id, author_id, title, isbn, genre, publication_date, status, mrp,
             author_royalty_per_copy, total_copies_sold, total_royalty_earned, royalty_paid,
             royalty_pending, last_royalty_payout_date, print_partner, available_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (id) DO UPDATE SET title=$3, isbn=$4, genre=$5, publication_date=$6, status=$7,
             mrp=$8, author_royalty_per_copy=$9, total_copies_sold=$10, total_royalty_earned=$11,
             royalty_paid=$12, royalty_pending=$13, last_royalty_payout_date=$14, print_partner=$15,
             available_on=$16`,
          [b.book_id, a.author_id, b.title, b.isbn, b.genre, b.publication_date, b.status, b.mrp,
           b.author_royalty_per_copy, b.total_copies_sold, b.total_royalty_earned, b.royalty_paid,
           b.royalty_pending, b.last_royalty_payout_date, b.print_partner, b.available_on],
        );
      }
    }
    for (const ad of ADMINS) {
      await c.query(
        `INSERT INTO users (email, password_hash, role, name)
         VALUES ($1,$2,'admin',$3) ON CONFLICT (email) DO NOTHING`,
        [ad.email, adminHash, ad.name],
      );
    }
  });

  const nBooks = authors.reduce((n, a) => n + a.books.length, 0);
  console.log(`✔ seeded ${authors.length} authors, ${nBooks} books, ${ADMINS.length} admins`);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
