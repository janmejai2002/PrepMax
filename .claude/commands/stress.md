Run the concurrency load test against join_slot:
1. Seed a fresh slot with capacity=6
2. Fire 100 concurrent join_slot RPC calls for 100 different user IDs against that slot
3. Query the enrollments table: count confirmed, count waitlist, check for oversells (confirmed > 6), check for duplicate (slot_id, user_id) pairs
4. Assert: exactly 6 confirmed, exactly 94 waitlisted, 0 oversells, 0 duplicate enrollments
5. Report the exact counts and pass/fail result

The test script lives at scripts/stress-test.ts. If it doesn't exist yet, create it.
