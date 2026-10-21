# Security Specification — ChronoScolaire AI

## 1. Data Invariants
1. **Default-Deny Global Gate**: Any path not explicitly matched is denied (`allow read, write: if false;`).
2. **Verified Identity**: Write operations require a verified authenticated user (`request.auth != null && request.auth.token.email_verified == true`) whose UID matches `updatedBy` or `authorId`.
3. **Path ID Hardening**: All single-document operations (`get`, `create`, `update`, `delete`) validate document IDs using `isValidId(id)` (`<= 128` chars, `^[a-zA-Z0-9_\-]+$`).
4. **Strict Schema & Key Allowlisting**: Every `create` and `update` invokes `isValidSchoolClass`, `isValidTeacher`, or `isValidNotification`, enforcing `hasAll` and `hasOnly` key checks, string `.size()` bounds, array `.size()` bounds, and map `.size()` bounds.
5. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on update; `updatedAt` must equal `request.time` on creation and update.
6. **Secure List Queries**: Every `allow list` rule enforces `resource.data.visibility == 'school'` so queries cannot scrape unscoped documents.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write (`classes`)**: `auth = null` attempting to create `/classes/pre-kg`. -> `PERMISSION_DENIED`
2. **Unverified Email Spoof (`admins`)**: `auth.token.email = 'cherifmed2010@gmail.com'`, `email_verified = false`. -> `PERMISSION_DENIED`
3. **Shadow Field Injection (`classes`)**: Payload includes extra key `isSuperAdmin: true`. -> `PERMISSION_DENIED`
4. **Identity Spoofing (`teachers`)**: `incoming().updatedBy != request.auth.uid`. -> `PERMISSION_DENIED`
5. **Path ID Poisoning (`classes`)**: Document ID with 200 characters or special characters `$@#`. -> `PERMISSION_DENIED`
6. **Oversized String Attack (`notifications`)**: `message` field with 2,000 characters (`> 500`). -> `PERMISSION_DENIED`
7. **Unbounded Array Attack (`teachers`)**: `unavailableSlots` array with 100 items (`> 40`). -> `PERMISSION_DENIED`
8. **Timestamp Forgery on Create (`classes`)**: Client-supplied past timestamp instead of `request.time`. -> `PERMISSION_DENIED`
9. **Immortal Field Mutation (`teachers`)**: Attempting to mutate `createdAt` during `update`. -> `PERMISSION_DENIED`
10. **Invalid Enum Value (`classes`)**: `section: 'InvalidSection'` not in allowed enum list. -> `PERMISSION_DENIED`
11. **Value Poisoning on Update (`teachers`)**: Updating `maxPeriodsPerWeek` to a string or negative number. -> `PERMISSION_DENIED`
12. **Unscoped List Query (`notifications`)**: Querying documents without `visibility == 'school'`. -> `PERMISSION_DENIED`
