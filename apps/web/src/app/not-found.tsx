import Link from "next/link";
export default function NotFound() {
  return (
    <div className="standalone-state">
      <h1>Let’s find your way back.</h1>
      <p>This page isn’t part of your workspace.</p>
      <Link className="button button-primary" href="/">
        Back to overview
      </Link>
    </div>
  );
}
