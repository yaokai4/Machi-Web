# Machi Media/UI Root-Cause Report

Date: 2026-06-08

## Scope

This report tracks the media, listing layout, cross-platform UI, and performance issues raised in the latest task document. It is intentionally implementation-facing: every item below maps to code changes and regression checks.

## Root Causes

1. Media objects are not returned with one stable contract.
   - Backend post media uses legacy fields such as `url`, `thumb_url`, `mime`, `byte_size`.
   - Listing media uses another shape: `media_type`, `thumbnail_url`, `thumbnailUrl`.
   - Uploaded files already expose newer fields such as `objectKey`, `cdnUrl`, `thumbnailUrl`, and `contentType`, but those fields are lost when the same file is serialized as post/listing media.
   - iOS and Android then guess from different field names, which makes images and videos inconsistent across surfaces.

2. Video thumbnails are not guaranteed.
   - The current thumbnail helper only returns an image fallback for image uploads.
   - Public videos often have no `thumbnailUrl`/`posterUrl`.
   - Web list grids render an actual `<video preload="metadata">` element, so videos without posters become grey blocks and add unnecessary network work.

3. Private media rules are partially hidden inside upload serialization.
   - `serialize_uploaded_file` correctly hides URLs for private purposes.
   - The normalized media DTO does not exist everywhere, so clients cannot reliably know whether to use a public CDN URL or a signed URL endpoint.

4. Listing cards do not have a normalized card DTO.
   - Web/iOS/Android each compute cover media, price labels, status badges, city labels, and favorite state locally.
   - This causes visual drift and makes secondhand cards fragile when the first media is a video or when `cover_url` is missing.

5. iOS media rendering is image-first.
   - Feed grids and previews use `CachedMediaImageView` for both images and videos.
   - Video previews show a play icon over a still image, but no `AVPlayer` playback path is used in the media preview.
   - `KaiXListingMediaDTO` does not decode the newer `thumbnailUrl`/`posterUrl`/`cdnUrl` aliases, so CloudFront-ready values can be ignored.

6. Listing layouts are duplicated and easy to squeeze.
   - The iOS secondhand card is embedded inside a large Discover file rather than a reusable ProductCard.
   - Some listing rows use fixed image widths/heights, and the secondhand grid can still produce cramped two-column cards in narrow contexts.
   - Text is below the image in the main secondhand card, but the reusable layout rules are not centralized.

7. Safe-area and bottom navigation spacing are handled per view.
   - Many screens add their own bottom padding.
   - This prevents one reliable rule for avoiding bottom-nav/FAB overlap, especially on channel/detail screens.

8. Web membership benefit localization had a backend-fallback leak.
   - The pricing page used backend benefit titles directly in some places.
   - Those titles stayed Chinese after language switching.

9. Repost visibility used interaction state, not profile content.
   - Repost toggles updated `interactions`, but profile tabs only loaded posts.
   - Without a `/users/:id/reposts` endpoint and a profile segment, Web could not show reposted content like iOS.

10. Marketplace region filters were promoted too high in the UI.
    - Kanto/Kansai/hot city groups appeared as primary top controls.
    - This made the market header visually heavy and duplicated the city/country intent.

11. Production listing creation failed after media upload.
    - PostgreSQL rejected the seller-profile upsert because
      `listing_count = listing_count + 1` was ambiguous inside
      `ON CONFLICT ... DO UPDATE`.
    - The original PostgreSQL migration also lacked an explicit unique index on
      `seller_profiles.user_id`, so `ON CONFLICT(user_id)` had no matching
      constraint even after the assignment was qualified.
    - The upload and complete requests succeeded, then `POST /api/listings`
      returned 500, which made the clients report a generic publishing error.

12. Listing uploads only accepted image purposes.
    - Web used `accept="image/*"` and selected an image purpose for every file.
    - iOS and Android listing pickers were image-only.
    - Backend listing validation required at least one image purpose and had no
      listing video purpose, so a valid video could not join a listing.

13. iOS could upload bytes with the wrong declared MIME.
    - PhotosPicker returned original HEIC bytes while the listing publisher sent
      `image/jpeg`.
    - The backend correctly rejected the mismatch during complete with 415.
    - Images now pass through the shared JPEG preparation pipeline before upload.

14. iOS post uploads silently discarded errors.
    - The post repository used `try?` around each media upload and then published
      the post without failed media.
    - Video uploads also selected `post_image` in the generic upload path.
    - Upload errors now remain visible and video MIME selects `post_video`.

15. Remote post media was never persisted into the iOS local store.
    - `RemoteSyncService.upsertPost` synced post text and counters but did not
      upsert `dto.media`.
    - Discovery, trending, and profile surfaces therefore had no local media to
      render even when the API response was correct.

16. iOS list video views created players too early.
    - `MediaVideoView` instantiated a player whenever a source URL existed.
    - A video without a poster displayed the player's grey/black initial frame.
    - The component now renders a poster or designed placeholder and creates the
      player only after an explicit play action.

## Required Fix Strategy

1. Add a backend-compatible normalized `MediaDTO` everywhere while keeping legacy fields for old clients.
2. Return `posterUrl` and thumbnail fallback fields for videos; clients must render poster/placeholder in lists and only load videos on open.
3. Add a normalized `ListingCardDTO` subset to listing responses.
4. Update Web media grid, lightbox, marketplace cards, message previews, and composer previews to use media helpers.
5. Update iOS DTOs and media views so image and video rendering are separated.
6. Update Android DTOs and card/media rendering to consume the same normalized fields.
7. Regression-test Web type/lint, backend compile/API smoke, iOS build, Android build, and browser screenshots on desktop/mobile.

## Implemented Result

- Added listing image/video purpose pairs for secondhand, rental, job, service,
  discount, and event publishing.
- Listing validation now accepts bounded images plus one bounded video and
  preserves media IDs through the business create request.
- Fixed the PostgreSQL seller-profile upsert by qualifying
  `seller_profiles.listing_count`, initializing the first listing count to one,
  and adding migration 39 for a unique `seller_profiles(user_id)` index.
- Web listing creation accepts images and videos, displays per-file state, blocks
  publish while uploads are incomplete, and preserves the form after failure.
- iOS uses prepared JPEG/QuickTime media, a shared `UploadManager` entry point,
  visible upload phases, retained uploaded media, and readable API errors.
- Android listing publishing accepts images/videos and uses the same purpose and
  entity-type contract.
- Web detail pages use real video controls with metadata preload; list cards use
  poster/thumbnail or a designed fallback instead of a naked grey video element.
- iOS remote sync now persists post and repost media; image/video components
  support fallback, retry, and click-to-play.
- Marketplace top controls now contain only current city/current country, while
  Kanto, Kansai, and other popular-city choices live in the filter panel.
- Profile reposts are returned from `/api/users/:id/reposts` and render the
  original post on the profile tab.
- Membership benefits, plan subtitles, prices, and discount labels localize in
  Chinese, English, and Japanese.

## Regression Evidence

- Backend: listing media contract, media type, thumbnails, private encryption,
  idempotency, migration startup, and PostgreSQL translation tests passed.
- API E2E: image/video presign, object upload, complete, secondhand create, rental
  create, detail fetch, and media association passed against an isolated database.
- Production E2E: a temporary account uploaded a JPEG and MP4 through the public
  API, received ready CloudFront MediaDTOs, created a PostgreSQL secondhand
  listing with both media records, fetched the detail, then deleted the listing
  and account successfully.
- Web: production build generated 209 pages; desktop and 390px mobile browser
  checks confirmed no document overflow, working video playback, compact region
  controls, localized membership benefits, and visible profile repost content.
- iOS: Debug simulator build passed for arm64 and x86_64.
- Android: all Debug product flavors assembled successfully.
