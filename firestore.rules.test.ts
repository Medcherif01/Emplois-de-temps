/**
 * Firestore Security Rules Test Suite — Dirty Dozen Verification
 */
export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const dirtyDozenTests: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write to classes',
    collection: 'classes',
    docId: 'pre-kg',
    auth: null,
    payload: { name: 'Pre-KG', section: 'KG', room: 'R1', visibility: 'school', slots: {}, updatedBy: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof',
    collection: 'classes',
    docId: 'pre-kg',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: false },
    payload: { name: 'Pre-KG', section: 'KG', room: 'R1', visibility: 'school', slots: {}, updatedBy: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection',
    collection: 'classes',
    docId: 'pre-kg',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { name: 'Pre-KG', section: 'KG', room: 'R1', visibility: 'school', slots: {}, updatedBy: 'u1', isVerified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity Spoofing on updatedBy',
    collection: 'teachers',
    docId: 't-rayan',
    auth: { uid: 'u1', email: 'teacher@school.edu', email_verified: true },
    payload: { name: 'Rayan', subjects: ['Maths'], section: 'KG', maxPeriodsPerWeek: 24, unavailableSlots: [], defaultAssigned: true, visibility: 'school', updatedBy: 'other-uid' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Path ID Poisoning',
    collection: 'classes',
    docId: 'invalid$id!@#',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { name: 'Pre-KG', section: 'KG', room: 'R1', visibility: 'school', slots: {}, updatedBy: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Oversized String Attack on notifications',
    collection: 'notifications',
    docId: 'notif-1',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { title: 'Update', message: 'A'.repeat(1000), type: 'schedule_updated', targetTeacher: 'all', visibility: 'school', authorId: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unbounded Array Attack on teachers',
    collection: 'teachers',
    docId: 't-rayan',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { name: 'Rayan', subjects: ['Maths'], section: 'KG', maxPeriodsPerWeek: 24, unavailableSlots: new Array(60).fill('Dimanche_1'), defaultAssigned: true, visibility: 'school', updatedBy: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Timestamp Forgery on Create',
    collection: 'classes',
    docId: 'pre-kg',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { name: 'Pre-KG', section: 'KG', room: 'R1', visibility: 'school', slots: {}, updatedBy: 'u1', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immortal Field Mutation on createdAt',
    collection: 'teachers',
    docId: 't-rayan',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { createdAt: '2026-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid Enum Value on Class Section',
    collection: 'classes',
    docId: 'pre-kg',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { name: 'Pre-KG', section: 'UnknownSection', room: 'R1', visibility: 'school', slots: {}, updatedBy: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning on maxPeriodsPerWeek',
    collection: 'teachers',
    docId: 't-rayan',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { maxPeriodsPerWeek: 999 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unscoped Visibility Value',
    collection: 'notifications',
    docId: 'notif-1',
    auth: { uid: 'u1', email: 'cherifmed2010@gmail.com', email_verified: true },
    payload: { title: 'Update', message: 'Valid', type: 'schedule_updated', targetTeacher: 'all', visibility: 'public', authorId: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
