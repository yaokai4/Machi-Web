import { permanentRedirect } from "next/navigation";

// `/my/favorites` and `/my/saved-listings` both rendered <MyListingsPage saved />.
// `/my/saved-listings` is the canonical route linked from the workbench;
// redirect the `favorites` alias to it to remove the duplicate surface.
export default function MyFavoritesRoute() {
  permanentRedirect("/my/saved-listings");
}
