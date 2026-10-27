export default function Loading() {
  return (
    <div className="page-loading" role="status">
      <div className="skeleton skeleton-title" />
      <div className="skeleton" />
      <div className="skeleton" />
      <span className="sr-only">Opening your page</span>
    </div>
  );
}
