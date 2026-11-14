// The Character Creator's and Player Tools' pages: creator.php and
// game-tools.php on the site, index.html and tools.html in development.
const onSite = () => location.pathname.endsWith(".php");
export const toolsPage = () => (onSite() ? "game-tools.php" : "tools.html");
export const creatorPage = () => (onSite() ? "creator.php" : "index.html");
