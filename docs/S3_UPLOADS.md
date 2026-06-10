# Machi S3 uploads

Machi uses backend-generated presigned URLs for Web, WebApp, iOS, and future Android uploads.

## Flow

1. Client calls `POST /api/uploads/presign` with file name, content type, size, purpose, optional entity, and optional media metadata such as `duration`, `threadId`, or `groupId`.
2. Backend validates login, purpose, size, MIME type, ownership, admin-only purposes, and upload quota.
3. Backend generates the S3 object key and returns a 5 minute PUT URL using boto3's default credential chain.
4. Public media PUTs directly to S3. Private media PUTs to the backend, which streams AES-256-GCM ciphertext to S3.
5. Client calls `POST /api/uploads/complete`.
6. Backend writes `uploaded_files`, mirrors a compatible `media` row, and links files when posts, listings, products, or private message attachments are saved.

## Required production variables

- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_CLOUDFRONT_DOMAIN`
- `KAIX_PRIVATE_MEDIA_KEY` (a stable base64-encoded 32-byte key)
- `S3_UPLOAD_MAX_SIZE`
- `S3_PRESIGN_EXPIRES_SECONDS`
- `S3_PRIVATE_DOWNLOAD_EXPIRES_SECONDS`

Do not configure IAM User access keys for EC2. Attach `S3instanceRole` (or an equivalent least-privilege role) to the instance and let boto3 obtain temporary credentials automatically.

## S3 CORS

Use this CORS policy on the bucket, then remove localhost after production validation:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
    "AllowedOrigins": [
      "https://machicity.com",
      "https://www.machicity.com",
      "https://machicity.jp",
      "https://www.machicity.jp",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Bucket and CDN

- Keep the bucket private.
- Let CloudFront read from S3 with OAC/OAI.
- Public images use `https://dog232f3wzni4.cloudfront.net/{object_key}` when `AWS_CLOUDFRONT_DOMAIN` is configured.
- Public post/listing/business media expose CloudFront `cdn_url` through compatible `media` rows. Private purposes keep `url`, `publicUrl`, `cdnUrl`, and `thumbnailUrl` empty in API responses.
- Private objects are encrypted with AES-256-GCM before S3 storage. CloudFront may be able to fetch an object key, but it can only return ciphertext.
- Guide paid PDFs do not expose permanent CDN URLs. After entitlement checks, the backend returns a short-lived application URL and decrypts the S3 object only while streaming it to the authorized client.
- Private message images/videos/files follow the same encrypted proxy path. Message payloads include `attachments[]` metadata plus `viewUrlEndpoint`; the backend verifies conversation membership before issuing the short-lived application URL.

## Purposes

Public user content:

- `post_image`, `post_video`
- `article_image`, `article_video`
- `experience_image`, `experience_video`
- `question_image`
- `group_post_image`, `group_post_video`
- listing images: `secondhand_image`, `rental_image`, `job_image`, `service_image`, `discount_image`

Private or entitlement-gated content:

- `message_image`, `message_video`, `message_file`
- `guide_product_file`, `member_resource_file`
- `business_verification_file`
- `post_audio`

Operational/video pipeline:

- `video_thumbnail`
- `video_processed_file`

## Data model

- `uploaded_files` is the canonical file record for all clients.
- `post_media` links post media and stores `uploaded_file_id`, `media_type`, ordering, cover flag, thumbnail pointer, dimensions, duration, and processing status.
- `message_attachments` links private DM attachments to a message and thread. Only conversation members or admins can request the short-lived application view URL.
- `media` remains the compatibility table for existing Web/iOS surfaces.

## Limits

- Public post images: 9 images, 10 MB each.
- Public post videos: 1 video, 200 MB, 5 minutes when duration metadata is supplied.
- Message images: 9 images, 10 MB each.
- Message videos: 1 video, 100 MB, 2 minutes when duration metadata is supplied.
- Message files: 1 file, 20 MB, disabled by default unless `MESSAGE_FILE_UPLOAD_ENABLED=1`.

## Local fallback

When S3 credentials are absent, the same API writes objects under `web/media/{object_key}`. This is for development and tests only. Production refuses upload requests without S3 and refuses startup with S3 configured but no valid private-media key.
