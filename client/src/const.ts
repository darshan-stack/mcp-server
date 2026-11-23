export const COOKIE_NAME = "postqueue_session";
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Start local owner mode. Call this from an event handler, e.g. onClick={() => startLogin()}
// Sets a localStorage flag and reloads the page to enter the owner dashboard.
export const startLogin = () => {
  localStorage.setItem("pq_dev", "1");
  window.location.reload();
};