import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import {
  runAccessBoundaryTests,
  runAccessModeTests,
  runActionTests,
  runAupRecipeTests,
  runCapabilitiesOperationsTests,
  runCapabilitiesResourceTests,
  runDeepListTests,
  runDeleteCaseTests,
  runEntryFieldsTests,
  runErrorInfoLeakTests,
  runErrorTypesTests,
  runEventDeclarationTests,
  runExecUsageMetadataTests,
  runExecuteTests,
  runExplainExistenceTests,
  runExplainTests,
  runInputInjectionTests,
  runListOptionsTests,
  runMetadataRichnessTests,
  runMetaTests,
  runNoHandlerTests,
  runPathNormalizationTests,
  runPathTraversalTests,
  runPerceptionPathTests,
  runReadTests,
  runResourceExhaustionTests,
  runRouteParamsTests,
  runSearchTests,
  runSecurityManifestTests,
  runSensitiveLeakTests,
  runStructureTests,
  runSymlinkEscapeTests,
  runTreeSchemaTests,
  runWriteCaseTests,
  runWriteModesTests,
} from "./suites/index.js";
import type { ProviderTestFixture, TestDataStructure } from "./types.js";

/**
 * Run provider conformance tests.
 *
 * @example
 * ```typescript
 * import { runProviderTests } from "@aigne/afs/testing";
 *
 * describe("MyProvider Conformance", () => {
 *   runProviderTests({
 *     name: "MyProvider",
 *     createProvider: () => new MyProvider({ ... }),
 *     structure: {
 *       root: {
 *         name: "",
 *         children: [
 *           { name: "file.txt", content: "Hello" },
 *           {
 *             name: "docs",
 *             children: [
 *               { name: "readme.md", content: "# Readme" },
 *             ],
 *           },
 *         ],
 *       },
 *     },
 *   });
 * });
 * ```
 */
export function runProviderTests<T extends AFSModule>(fixture: ProviderTestFixture<T>): void {
  let provider: T;

  const config = fixture.config ?? {};
  const structure: TestDataStructure = fixture.structure;

  describe(fixture.name, () => {
    // Setup lifecycle hooks
    if (fixture.beforeAll) {
      beforeAll(fixture.beforeAll);
    }

    beforeAll(async () => {
      provider = await fixture.createProvider();
    });

    if (fixture.afterAll) {
      afterAll(fixture.afterAll);
    }

    if (fixture.beforeEach) {
      beforeEach(fixture.beforeEach);
    }

    if (fixture.afterEach) {
      afterEach(fixture.afterEach);
    }

    // Verify playground setup function is provided
    describe("PlaygroundExistence", () => {
      it("provides playground setup function", () => {
        expect(fixture.playground).toBeFunction();
      });
    });

    // Run structure validation tests
    describe("StructureValidation", () => {
      runStructureTests(() => provider, structure.root, config);
    });

    // Run core operation test suites
    describe("ReadOperations", () => {
      runReadTests(() => provider, structure, config);
    });

    describe("SearchOperations", () => {
      runSearchTests(() => provider, structure, config);
    });

    describe("MetaOperations", () => {
      runMetaTests(() => provider, structure, config);
    });

    // Run execute tests if cases are provided
    if (fixture.executeCases && fixture.executeCases.length > 0) {
      describe("ExecuteOperations", () => {
        runExecuteTests(() => provider, fixture.executeCases!, config);
      });
    }

    // Run explain tests
    describe("ExplainOperations", () => {
      runExplainTests(() => provider, structure, config);
    });

    // Run validation test suites
    describe("AccessModeValidation", () => {
      runAccessModeTests(() => provider, config);
    });

    describe("ErrorTypesValidation", () => {
      runErrorTypesTests(() => provider, config);
    });

    describe("EntryFieldsValidation", () => {
      runEntryFieldsTests(() => provider, structure, config);
    });

    describe("ListOptionsValidation", () => {
      runListOptionsTests(() => provider, structure, config);
    });

    describe("PathNormalizationValidation", () => {
      runPathNormalizationTests(() => provider, structure, config);
    });

    // Run deep list traversal tests
    describe("DeepListValidation", () => {
      runDeepListTests(() => provider, structure, config);
    });

    // Run no-handler error tests
    describe("NoHandlerValidation", () => {
      runNoHandlerTests(() => provider, config);
    });

    // Run route params tests
    describe("RouteParamsValidation", () => {
      runRouteParamsTests(() => provider, structure, config);
    });

    // Run agent-friendliness validation suites
    describe("MetadataRichnessValidation", () => {
      runMetadataRichnessTests(() => provider, structure, config);
    });

    describe("ExplainExistenceValidation", () => {
      runExplainExistenceTests(() => provider, structure, config);
    });

    describe("CapabilitiesOperationsValidation", () => {
      runCapabilitiesOperationsTests(() => provider, structure, config);
    });

    // Optional: Run capabilities resource validation if fixture declares expectResources
    if (fixture.expectResources) {
      describe("CapabilitiesResourceValidation", () => {
        runCapabilitiesResourceTests(() => provider, config);
      });
    }

    // Optional: Run event declaration validation if fixture declares events
    if (fixture.events && fixture.events.length > 0) {
      describe("EventDeclarationValidation", () => {
        runEventDeclarationTests(() => provider, fixture.events!, config);
      });
    }

    // Optional: Run exec usage metadata validation if fixture declares expectUsage
    if (fixture.expectUsage && fixture.executeCases && fixture.executeCases.length > 0) {
      describe("ExecUsageMetadataValidation", () => {
        runExecUsageMetadataTests(() => provider, fixture.executeCases!, config);
      });
    }

    // Optional: Run perception path validation if fixture declares perception
    if (fixture.perception) {
      describe("PerceptionPathValidation", () => {
        runPerceptionPathTests(() => provider, structure, fixture.perception!, config);
      });
    }

    // Optional: Run .aup/ recipe validation if fixture declares aup
    if (fixture.aup) {
      describe("AupRecipeValidation", () => {
        runAupRecipeTests(() => provider, structure, fixture.aup!, config);
      });
    }

    // Optional: Run security manifest validation if providerClass is provided
    if (fixture.providerClass) {
      describe("SecurityManifestValidation", () => {
        runSecurityManifestTests(fixture.providerClass, config);
      });

      describe("TreeSchemaValidation", () => {
        runTreeSchemaTests(fixture.providerClass!, config);
      });
    }

    // Security test suites — run for all providers
    describe("PathTraversalSecurity", () => {
      runPathTraversalTests(() => provider, config);
    });

    describe("AccessBoundarySecurity", () => {
      runAccessBoundaryTests(() => provider, config);
    });

    describe("ResourceExhaustionSecurity", () => {
      runResourceExhaustionTests(() => provider, config);
    });

    // Conditional security suites
    describe("InputInjectionSecurity", () => {
      runInputInjectionTests(() => provider, structure, config);
    });

    describe("SensitiveLeakSecurity", () => {
      runSensitiveLeakTests(() => provider, structure, config);
    });

    // Symlink escape — only for providers with local-filesystem access
    if (fixture.providerClass) {
      describe("SymlinkEscapeSecurity", () => {
        runSymlinkEscapeTests(() => provider, fixture.providerClass, config);
      });
    }

    describe("ErrorInfoLeakSecurity", () => {
      runErrorInfoLeakTests(() => provider, config);
    });

    // ============================================================
    // DESTRUCTIVE TESTS - Run these LAST because they modify data
    // ============================================================

    // Run write modes tests when opted in via expectWriteModes
    if (fixture.expectWriteModes) {
      const writeModesPrefix =
        typeof fixture.expectWriteModes === "string" ? fixture.expectWriteModes : "";
      describe("WriteModesValidation", () => {
        runWriteModesTests(() => provider, config, writeModesPrefix);
      });
    }

    // Run action case tests if cases are provided
    if (fixture.actionCases && fixture.actionCases.length > 0) {
      describe("ActionOperations", () => {
        runActionTests(() => provider, fixture.actionCases!, config);
      });
    }

    // Run write case tests if cases are provided
    if (fixture.writeCases && fixture.writeCases.length > 0) {
      describe("WriteCaseOperations", () => {
        runWriteCaseTests(() => provider, fixture.writeCases!, config);
      });
    }

    // Run delete case tests if cases are provided
    if (fixture.deleteCases && fixture.deleteCases.length > 0) {
      describe("DeleteCaseOperations", () => {
        runDeleteCaseTests(() => provider, fixture.deleteCases!, config);
      });
    }
  });
}
