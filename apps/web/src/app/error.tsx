"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="standalone-state" role="alert">
      <h1>This page needs another moment.</h1>
      <p>
        Your workspace couldn’t finish opening. Try again to return to your
        page.
      </p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
