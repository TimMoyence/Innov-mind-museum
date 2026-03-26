/** Pagination parameters for list endpoints. */
export interface PaginationParams {
  page: number;
  limit: number;
}

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
