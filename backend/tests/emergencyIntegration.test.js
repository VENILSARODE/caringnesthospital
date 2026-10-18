/**
 * Caring Nest - Phase 14 / Step 14.2 Emergency API Integration Tests
 *
 * Safe synthetic test suite.
 * All tests use synthetic in-memory data and mocks.
 * Zero database writes occur to live hospital records.
 */

const assert = require("assert");
const Emergency = require("../models/Emergency");
const router = require("../routes/emergencyRoutes");

const {
    normalizeEmergencyPayload,
    validateRequiredFields,
    parseAge,
    normalizeMlc,
    normalizeGender,
    normalizeConsciousness,
    normalizeSeverity,
    extractVapiPayload,
    verifyVapiSecret,
    createEmergencyCase,
} = router;

// Helper to create mock Express req and res
function createMockReqRes({ body = {}, headers = {}, query = {}, io = null }) {
    const req = {
        body,
        headers,
        query,
        app: {
            get: (key) => (key === "io" ? io : null),
        },
    };

    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
    };

    return { req, res };
}

// Helper to create mock Socket.IO
function createMockIo() {
    const events = [];
    return {
        events,
        emit(eventName, payload) {
            events.push({ eventName, payload });
        },
    };
}

async function runTests() {
    console.log("=================================================");
    console.log("CARING NEST — PHASE 14.2 EMERGENCY API TEST SUITE");
    console.log("Safe synthetic testing: Zero live DB records created");
    console.log("=================================================\n");

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`[FAIL] ${name}:`, err.message);
            failed++;
        }
    }

    async function testAsync(name, fn) {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`[FAIL] ${name}:`, err.message);
            failed++;
        }
    }

    // Preserve original Emergency methods
    const originalCreate = Emergency.create;
    const originalFindOne = Emergency.findOne;
    const originalCountDocuments = Emergency.countDocuments;
    const originalExists = Emergency.exists;

    // ----------------------------------------------------
    // TEST 1: Valid emergency payload
    // ----------------------------------------------------
    await testAsync("1. Valid emergency payload creates record and returns 201", async () => {
        const mockIo = createMockIo();
        let savedDoc = null;

        Emergency.findOne = async () => null; // No duplicate
        Emergency.countDocuments = async () => 10;
        Emergency.exists = async () => false;
        Emergency.create = async (doc) => {
            savedDoc = { ...doc, _id: "synthetic_mongo_id_1" };
            return savedDoc;
        };

        const payload = {
            patientName: "Synthetic Patient Alpha",
            age: 34,
            gender: "Female",
            accidentType: "Fall",
            injuries: "Fractured left arm",
            consciousness: "CONSCIOUS",
            severity: "MODERATE",
            location: "Ward 4 Corridor",
            callerName: "Nurse Incharge",
            callerPhone: "9876543210",
            mlcCase: true,
            languageUsed: "English",
        };

        const { req, res } = createMockReqRes({ body: payload, io: mockIo });
        await createEmergencyCase(req, res);

        assert.strictEqual(res.statusCode, 201, "Expected status 201");
        assert.strictEqual(res.body.success, true, "Expected success true");
        assert.strictEqual(res.body.emergency.emergencyId, "EMG-0011", "Expected generated EMG-0011");
        assert.strictEqual(res.body.emergency.patientName, "Synthetic Patient Alpha");
        assert.strictEqual(res.body.emergency.mlcCase, true);
        assert.strictEqual(savedDoc.status, "NEW");
        assert.strictEqual(mockIo.events.length, 1, "Expected 1 socket event emitted");
        assert.strictEqual(mockIo.events[0].eventName, "emergency:created");
        assert.strictEqual(mockIo.events[0].payload.emergencyId, "EMG-0011");
    });

    // ----------------------------------------------------
    // TEST 2: Vapi snake_case field mapping
    // ----------------------------------------------------
    await testAsync("2. Vapi snake_case field mapping (patient_name, accident_type, contact, etc.)", async () => {
        const mockIo = createMockIo();
        let createdPayload = null;

        Emergency.findOne = async () => null;
        Emergency.countDocuments = async () => 20;
        Emergency.exists = async () => false;
        Emergency.create = async (doc) => {
            createdPayload = doc;
            return { ...doc, _id: "synthetic_mongo_id_2" };
        };

        const vapiPayload = {
            patient_name: "Ravi Shankar",
            accident_type: "Road Traffic Collision",
            accident_location: "Ring Road Flyover",
            contact: "9988776655",
            caller_name: "Eyewitness Amit",
            mlc: "yes",
            language_used: "Hindi",
            arrival_time: "2026-10-19T02:00:00Z",
            arrival_date: "2026-10-19",
            doctor: "Dr. K. Patel",
            age: "42",
            gender: "male",
            injuries: "Head trauma and blunt chest injury",
            consciousness: "Unconscious",
            severity: "Critical",
            condition: "Unconscious",
            triage: "Red",
        };

        const { req, res } = createMockReqRes({ body: vapiPayload, io: mockIo });
        await createEmergencyCase(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(createdPayload.patientName, "Ravi Shankar");
        assert.strictEqual(createdPayload.accidentType, "Road Traffic Collision");
        assert.strictEqual(createdPayload.location, "Ring Road Flyover");
        assert.strictEqual(createdPayload.callerPhone, "9988776655");
        assert.strictEqual(createdPayload.callerName, "Eyewitness Amit");
        assert.strictEqual(createdPayload.mlcCase, true, "MLC 'yes' must normalize to boolean true");
        assert.strictEqual(createdPayload.languageUsed, "Hindi");
        assert.strictEqual(createdPayload.arrivalTime, "2026-10-19T02:00:00Z");
        assert.strictEqual(createdPayload.arrivalDate, "2026-10-19");
        assert.strictEqual(createdPayload.assignedDoctor, "Dr. K. Patel");
        assert.strictEqual(createdPayload.age, 42, "Age '42' string must normalize to numeric 42");
        assert.strictEqual(createdPayload.gender, "Male", "Gender 'male' must normalize to 'Male'");
        assert.strictEqual(createdPayload.consciousness, "UNCONSCIOUS");
        assert.strictEqual(createdPayload.severity, "CRITICAL");
    });

    // ----------------------------------------------------
    // TEST 3: Missing required fields
    // ----------------------------------------------------
    await testAsync("3. Missing required fields returns 400 with list of missing fields", async () => {
        let createCalled = false;
        Emergency.create = async () => {
            createCalled = true;
        };

        // Sub-case A: Completely empty payload
        {
            const { req, res } = createMockReqRes({ body: {} });
            await createEmergencyCase(req, res);

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(res.body.fields.includes("patientName"), "Must report missing patientName");
            assert.ok(res.body.fields.includes("age"), "Must report missing age");
            assert.ok(res.body.fields.includes("injuries"), "Must report missing injuries");
            assert.ok(res.body.fields.includes("location"), "Must report missing location");
            assert.ok(res.body.fields.includes("callerPhone"), "Must report missing callerPhone");
            assert.strictEqual(createCalled, false, "Emergency.create must not be called");
        }

        // Sub-case B: Missing location and callerPhone
        {
            const partial = {
                patientName: "Test Patient",
                age: 25,
                injuries: "Minor scrape",
            };
            const { req, res } = createMockReqRes({ body: partial });
            await createEmergencyCase(req, res);

            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.fields.includes("location"), "Must report missing location");
            assert.ok(res.body.fields.includes("callerPhone"), "Must report missing callerPhone");
            assert.strictEqual(createCalled, false, "Emergency.create must not be called");
        }
    });

    // ----------------------------------------------------
    // TEST 4: Invalid age
    // ----------------------------------------------------
    await testAsync("4. Invalid age (negative or non-numeric) returns 400 with 'age' error", async () => {
        let createCalled = false;
        Emergency.create = async () => {
            createCalled = true;
        };

        const baseValid = {
            patientName: "Valid Patient",
            accidentType: "Accident",
            injuries: "Sprained ankle",
            location: "Main Lobby",
            callerName: "Nurse",
            callerPhone: "9000000000",
        };

        // Negative age
        {
            const { req, res } = createMockReqRes({ body: { ...baseValid, age: -5 } });
            await createEmergencyCase(req, res);
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.fields.includes("age"), "Negative age must be rejected");
        }

        // String non-numeric age
        {
            const { req, res } = createMockReqRes({ body: { ...baseValid, age: "invalid" } });
            await createEmergencyCase(req, res);
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.fields.includes("age"), "String 'invalid' must be rejected");
        }

        // Text age
        {
            const { req, res } = createMockReqRes({ body: { ...baseValid, age: "thirty-two" } });
            await createEmergencyCase(req, res);
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.fields.includes("age"), "Text 'thirty-two' must be rejected");
        }

        assert.strictEqual(createCalled, false, "Emergency.create must never be called on invalid age");
    });

    // ----------------------------------------------------
    // TEST 5: Database failure handling
    // ----------------------------------------------------
    await testAsync("5. Database failure handling catches error and returns 500", async () => {
        const mockIo = createMockIo();

        Emergency.findOne = async () => null;
        Emergency.countDocuments = async () => 5;
        Emergency.exists = async () => false;
        Emergency.create = async () => {
            throw new Error("Synthetic MongoDB connection failure");
        };

        const payload = {
            patientName: "Database Test Patient",
            age: 50,
            accidentType: "Cardiac Arrest",
            injuries: "Severe chest pain",
            consciousness: "UNCONSCIOUS",
            severity: "CRITICAL",
            location: "Highway 9",
            callerName: "Ambulance EMT",
            callerPhone: "108",
        };

        const { req, res } = createMockReqRes({ body: payload, io: mockIo });
        await createEmergencyCase(req, res);

        assert.strictEqual(res.statusCode, 500, "Must return status 500 on DB failure");
        assert.strictEqual(res.body.success, false);
        assert.ok(res.body.message.includes("Failed to create emergency case"));
        assert.strictEqual(mockIo.events.length, 0, "Socket.IO event must NOT be emitted when DB save fails");
    });

    // ----------------------------------------------------
    // TEST 6: Socket.IO event emission only after successful persistence
    // ----------------------------------------------------
    await testAsync("6. Socket.IO event emission happens ONLY after DB persistence succeeds", async () => {
        let dbSaved = false;
        let socketEmittedWhenDbSaved = false;

        const mockIo = {
            emit(event, data) {
                if (dbSaved) {
                    socketEmittedWhenDbSaved = true;
                }
            },
        };

        Emergency.findOne = async () => null;
        Emergency.countDocuments = async () => 1;
        Emergency.exists = async () => false;
        Emergency.create = async (doc) => {
            // Simulate brief delay in DB write
            await new Promise((r) => setTimeout(r, 10));
            dbSaved = true;
            return { ...doc, emergencyId: "EMG-0002" };
        };

        const payload = {
            patientName: "Persistence Order Patient",
            age: 29,
            accidentType: "Accident",
            injuries: "Head injury",
            location: "Sector 7",
            callerName: "Officer",
            callerPhone: "9876543210",
        };

        const { req, res } = createMockReqRes({ body: payload, io: mockIo });
        await createEmergencyCase(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(dbSaved, true, "DB save must have succeeded");
        assert.strictEqual(socketEmittedWhenDbSaved, true, "Socket event must only be emitted after DB save");
    });

    // ----------------------------------------------------
    // TEST 7: Duplicate emergency record prevention on retries
    // ----------------------------------------------------
    await testAsync("7. Duplicate emergency record prevention on retries (idempotency key & 60s window)", async () => {
        let createCallCount = 0;
        Emergency.create = async (doc) => {
            createCallCount++;
            return { ...doc, emergencyId: "EMG-0003" };
        };

        // Case A: Duplicate by vapiCallId
        const existingRecord = {
            emergencyId: "EMG-0001",
            patientName: "Existing Patient",
            vapiCallId: "vapi_call_unique_999",
            status: "NEW",
        };
        Emergency.findOne = async (query) => {
            if (query.vapiCallId === "vapi_call_unique_999") {
                return existingRecord;
            }
            return null;
        };

        const payloadWithCallId = {
            vapiCallId: "vapi_call_unique_999",
            patientName: "Existing Patient",
            age: 30,
            accidentType: "Emergency",
            injuries: "Leg injury",
            location: "North Block",
            callerPhone: "9000000000",
        };

        const { req: reqA, res: resA } = createMockReqRes({ body: payloadWithCallId });
        await createEmergencyCase(reqA, resA);

        assert.strictEqual(resA.statusCode, 200, "Duplicate retry should return 200 OK");
        assert.strictEqual(resA.body.isDuplicate, true, "Must flag isDuplicate: true");
        assert.strictEqual(resA.body.emergency.emergencyId, "EMG-0001");
        assert.strictEqual(createCallCount, 0, "Emergency.create must NOT be called for duplicate callId");

        // Case B: Duplicate by recent identical submission (within 60s)
        Emergency.findOne = async (query) => {
            if (query.createdAt) {
                return existingRecord;
            }
            return null;
        };

        const { req: reqB, res: resB } = createMockReqRes({ body: payloadWithCallId });
        await createEmergencyCase(reqB, resB);

        assert.strictEqual(resB.statusCode, 200);
        assert.strictEqual(resB.body.isDuplicate, true);
        assert.strictEqual(createCallCount, 0, "Emergency.create must NOT be called for recent duplicate");
    });

    // ----------------------------------------------------
    // TEST 8: Vapi Secret verification middleware
    // ----------------------------------------------------
    test("8. Vapi Secret verification middleware security checks", () => {
        // Case A: Server secret not configured
        delete process.env.VAPI_WEBHOOK_SECRET;
        delete process.env.VAPI_SECRET;
        {
            let nextCalled = false;
            const { req, res } = createMockReqRes({});
            verifyVapiSecret(req, res, () => { nextCalled = true; });
            assert.strictEqual(res.statusCode, 500, "Missing server secret must return 500");
            assert.strictEqual(nextCalled, false);
        }

        // Set synthetic test secret in process.env
        process.env.VAPI_WEBHOOK_SECRET = "synthetic_vapi_secret_test_xyz";

        // Case B: Missing secret in request
        {
            let nextCalled = false;
            const { req, res } = createMockReqRes({});
            verifyVapiSecret(req, res, () => { nextCalled = true; });
            assert.strictEqual(res.statusCode, 401, "Missing request secret must return 401");
            assert.strictEqual(nextCalled, false);
        }

        // Case C: Invalid secret
        {
            let nextCalled = false;
            const { req, res } = createMockReqRes({
                headers: { "x-vapi-secret": "wrong_secret" },
            });
            verifyVapiSecret(req, res, () => { nextCalled = true; });
            assert.strictEqual(res.statusCode, 401, "Wrong secret must return 401");
            assert.strictEqual(nextCalled, false);
        }

        // Case D: Valid secret in x-vapi-secret header
        {
            let nextCalled = false;
            const { req, res } = createMockReqRes({
                headers: { "x-vapi-secret": "synthetic_vapi_secret_test_xyz" },
            });
            verifyVapiSecret(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true, "Valid secret in x-vapi-secret must call next()");
        }

        // Case E: Valid secret in Authorization: Bearer <secret>
        {
            let nextCalled = false;
            const { req, res } = createMockReqRes({
                headers: { authorization: "Bearer synthetic_vapi_secret_test_xyz" },
            });
            verifyVapiSecret(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true, "Valid secret in Bearer header must call next()");
        }

        // Clean up test secret
        delete process.env.VAPI_WEBHOOK_SECRET;
    });

    // ----------------------------------------------------
    // TEST 9: Vapi tool call payload extraction and response structure
    // ----------------------------------------------------
    await testAsync("9. Vapi assistant tool-call payload unwrapping and structured response", async () => {
        Emergency.findOne = async () => null;
        Emergency.countDocuments = async () => 4;
        Emergency.exists = async () => false;
        Emergency.create = async (doc) => ({ ...doc, _id: "vapi_doc_id" });

        const vapiToolCallBody = {
            message: {
                type: "tool-calls",
                call: { id: "call_vapi_tool_test" },
                toolCalls: [
                    {
                        id: "tool_call_abc",
                        type: "function",
                        function: {
                            name: "create_emergency",
                            arguments: {
                                patient_name: "Anita Desai",
                                accident_type: "Burn",
                                accident_location: "Kitchen, Flat 3B",
                                contact: "9876501234",
                                caller_name: "Sister Priya",
                                age: 26,
                                injuries: "Second degree burns on right hand",
                                consciousness: "Conscious",
                                severity: "Moderate",
                            },
                        },
                    },
                ],
            },
        };

        const { req, res } = createMockReqRes({ body: vapiToolCallBody });
        await createEmergencyCase(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.emergency.patientName, "Anita Desai");
        assert.strictEqual(res.body.emergency.vapiCallId, "call_vapi_tool_test");
        assert.ok(Array.isArray(res.body.results), "Vapi tool call response must include results array");
        assert.strictEqual(res.body.results[0].toolCallId, "tool_call_abc");
        assert.ok(res.body.results[0].result.includes("registered successfully"));
    });

    // Restore original Emergency methods
    Emergency.create = originalCreate;
    Emergency.findOne = originalFindOne;
    Emergency.countDocuments = originalCountDocuments;
    Emergency.exists = originalExists;

    console.log("\n=================================================");
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log("=================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
