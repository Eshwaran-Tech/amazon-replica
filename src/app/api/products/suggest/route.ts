import { defineHandler } from '@/lib/api/handler';
import { apiSuccess } from '@/lib/api/response';
import { searchSuggestSchema, type SearchSuggestInput } from '@/lib/validations/search';
import { getSearchSuggestions } from '@/services/catalog';

/**
 * Type-ahead suggestions.
 *
 * Public and unauthenticated, so it is rate-limited generously but firmly --
 * it is called on almost every keystroke, and it is the cheapest endpoint for
 * an attacker to hammer.
 *
 * The query is capped at 60 characters by the schema and escaped into an
 * anchored regex by `buildSuggestionFilter`, so `(a+)+$` cannot become a
 * catastrophic-backtracking pattern evaluated against every product name.
 */
export const GET = defineHandler<SearchSuggestInput>(
  {
    auth: 'none',
    schema: searchSuggestSchema,
    source: 'searchParams',
    rateLimit: [{ name: 'suggest:ip', by: 'ip' }],
    // GET is not state-changing, so there is no CSRF token to check.
    csrf: false,
  },
  async ({ input }) => {
    const suggestions = await getSearchSuggestions(input.q, input.limit);
    return apiSuccess(suggestions);
  },
);
