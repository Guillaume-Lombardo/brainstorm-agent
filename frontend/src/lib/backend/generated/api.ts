export interface paths {
  "/api/v1/auth/oidc": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Provision Oidc
     * @description Resolve trusted OIDC claims using issuer and subject.
     *
     *     Args:
     *         body: OIDCRequest: Verified provider identity.
     *         request: Request: Incoming bridge request.
     *         db: Session: Request transaction.
     *
     *     Returns:
     *         UserResponse: Provisioned or linked user.
     *
     *     Raises:
     *         HTTPException: OIDC disabled, wrong issuer or identity conflict.
     */
    post: operations["provision_oidc_api_v1_auth_oidc_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/verify": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Verify Credentials
     * @description Verify local credentials for the Credentials provider.
     *
     *     Args:
     *         body: CredentialsRequest: Candidate login.
     *         request: Request: Incoming bridge request.
     *         db: Session: Request transaction.
     *
     *     Returns:
     *         UserResponse: Verified user.
     *
     *     Raises:
     *         HTTPException: Invalid credentials or disabled account.
     */
    post: operations["verify_credentials_api_v1_auth_verify_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List Sessions
     * @description List owner sessions with bounded pagination.
     *
     *     Args:
     *         service (Service): Request parameter or session service.
     *         offset (Annotated[int, Query(ge=0)]): Request parameter or session service.
     *         limit (Annotated[int, Query(ge=1, le=100)]): Request parameter or session service.
     *         include_archived (bool): Request parameter or session service.
     *
     *     Returns:
     *         SessionPage: Application service result.
     */
    get: operations["list_sessions_api_v1_sessions_get"];
    put?: never;
    /**
     * Create Session
     * @description Create a new brainstorming session.
     *
     *     Args:
     *         session_service: Session application service.
     *         payload: Optional creation metadata.
     *
     *     Returns:
     *         CreateSessionResponse: Newly created session payload.
     */
    post: operations["create_session_api_v1_sessions_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Session
     * @description Return the current state of a session.
     *
     *     Args:
     *         session_id: Session identifier.
     *         session_service: Session application service.
     *
     *     Returns:
     *         SessionResponse: Session snapshot.
     */
    get: operations["get_session_api_v1_sessions__session_id__get"];
    put?: never;
    post?: never;
    /**
     * Delete Session
     * @description Soft-delete an owned session.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     */
    delete: operations["delete_session_api_v1_sessions__session_id__delete"];
    options?: never;
    head?: never;
    /**
     * Update Session
     * @description Rename or archive an owned session.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         payload (SessionPatch): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         SessionOverview: Application service result.
     */
    patch: operations["update_session_api_v1_sessions__session_id__patch"];
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/comments": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Add Comment
     * @description Save section feedback for the next successful turn.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         payload (CommentInput): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         SessionOverview: Application service result.
     */
    post: operations["add_comment_api_v1_sessions__session_id__comments_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/document": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Current Document
     * @description Return the latest current stage document.
     *
     *     Args:
     *         session_id: Session identifier.
     *         session_service: Session application service.
     *
     *     Returns:
     *         StepDocument: Current stage document.
     */
    get: operations["get_current_document_api_v1_sessions__session_id__document_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/documents": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List Documents
     * @description Return all versioned stage documents for a session.
     *
     *     Args:
     *         session_id: Session identifier.
     *         session_service: Session application service.
     *
     *     Returns:
     *         DocumentsResponse: Versioned documents.
     */
    get: operations["list_documents_api_v1_sessions__session_id__documents_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/export/backlog_json": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Export Backlog
     * @description Export validated backlog assignments, dependencies and delivery waves.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         BacklogExport: Application service result.
     */
    get: operations["export_backlog_api_v1_sessions__session_id__export_backlog_json_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/export/json": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Export Json
     * @description Export the full session as structured JSON.
     *
     *     Args:
     *         session_id: Session identifier.
     *         session_service: Session application service.
     *
     *     Returns:
     *         ExportJsonResponse: Structured JSON export payload.
     */
    get: operations["export_json_api_v1_sessions__session_id__export_json_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/export/markdown": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Export Markdown
     * @description Export the full session as consolidated Markdown.
     *
     *     Args:
     *         session_id: Session identifier.
     *         session_service: Session application service.
     *
     *     Returns:
     *         ExportMarkdownResponse: Markdown export payload.
     */
    get: operations["export_markdown_api_v1_sessions__session_id__export_markdown_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/export/slice_specs": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Export Specs
     * @description Export validated standalone Markdown slice specifications.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         SliceSpecsExport: Application service result.
     */
    get: operations["export_specs_api_v1_sessions__session_id__export_slice_specs_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/messages": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List Messages
     * @description Return message history for a session.
     *
     *     Args:
     *         session_id: Session identifier.
     *         session_service: Session application service.
     *
     *     Returns:
     *         ConversationHistoryResponse: Ordered conversation turns.
     */
    get: operations["list_messages_api_v1_sessions__session_id__messages_get"];
    put?: never;
    /**
     * Post Message
     * @description Process one user message for a session.
     *
     *     Args:
     *         session_id: Session identifier.
     *         payload: Message payload.
     *         session_service: Session application service.
     *
     *     Returns:
     *         PostMessageResponse: Structured assistant response.
     */
    post: operations["post_message_api_v1_sessions__session_id__messages_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/messages/stream": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Post Message Stream
     * @description Process one user message and return an SSE stream with the final payload.
     *
     *     Args:
     *         session_id: Session identifier.
     *         payload: Message payload.
     *         session_service: Session application service.
     *
     *     Returns:
     *         StreamingResponse: Server-sent events stream.
     */
    post: operations["post_message_stream_api_v1_sessions__session_id__messages_stream_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/research": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Research History
     * @description Read owned benchmark history and configured availability.
     *
     *     Args:
     *         session_id (str): Owned session.
     *         service (Service): Application service.
     *
     *     Returns:
     *         dict: Availability and versioned results.
     */
    get: operations["research_history_api_v1_sessions__session_id__research_get"];
    put?: never;
    /**
     * Research Products
     * @description Stream research completion while its async network calls execute.
     *
     *     Args:
     *         session_id (str): Owned session.
     *         service (Service): Application service.
     *
     *     Returns:
     *         StreamingResponse: Start and terminal SSE events.
     */
    post: operations["research_products_api_v1_sessions__session_id__research_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/research/{benchmark_id}/selection": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Select Research Features
     * @description Persist explicit owner selection.
     *
     *     Args:
     *         session_id (str): Owned session.
     *         benchmark_id (str): Execution id.
     *         payload (FeatureSelection): Selected candidate ids.
     *         service (Service): Application service.
     *
     *     Returns:
     *         Benchmark: Updated execution.
     */
    patch: operations["select_research_features_api_v1_sessions__session_id__research__benchmark_id__selection_patch"];
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/review": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Submit Review
     * @description Approve, reject, or request changes on the pending stage.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         payload (ReviewInput): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         SessionOverview: Application service result.
     */
    post: operations["submit_review_api_v1_sessions__session_id__review_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/reviews": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List Human Reviews
     * @description List human review decisions for a session.
     *
     *     Args:
     *         session_id: Session identifier.
     *         session_service: Session application service.
     *
     *     Returns:
     *         HumanReviewsResponse: Human review history.
     */
    get: operations["list_human_reviews_api_v1_sessions__session_id__reviews_get"];
    put?: never;
    /**
     * Review Pending Transition
     * @description Approve or reject a pending human-reviewed transition.
     *
     *     Args:
     *         session_id: Session identifier.
     *         payload: Review payload.
     *         session_service: Session application service.
     *
     *     Returns:
     *         SessionResponse: Updated session overview.
     */
    post: operations["review_pending_transition_api_v1_sessions__session_id__reviews_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/stages/{stage}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Edit Stage
     * @description Replace supplied fields/item collections and revalidate without advancing.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         stage (Stage): Request parameter or session service.
     *         payload (StagePatch): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         SessionOverview: Application service result.
     */
    patch: operations["edit_stage_api_v1_sessions__session_id__stages__stage__patch"];
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/stages/{stage}/documents": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Stage Documents
     * @description List immutable versions for one owned stage.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         stage (Stage): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         list[StepDocument]: Application service result.
     */
    get: operations["stage_documents_api_v1_sessions__session_id__stages__stage__documents_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/stages/{stage}/documents/diff": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Document Diff
     * @description Compare two versions of the same stage document.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         stage (Stage): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *         from_version (Annotated[int, Query(ge=1)]): Request parameter or session service.
     *         to_version (Annotated[int, Query(ge=1)]): Request parameter or session service.
     *
     *     Returns:
     *         DocumentDiff: Application service result.
     */
    get: operations["document_diff_api_v1_sessions__session_id__stages__stage__documents_diff_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/stages/{stage}/fields/{field}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Edit Field
     * @description Edit one stage field using its typed JSON value.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         stage (Stage): Request parameter or session service.
     *         field (str): Request parameter or session service.
     *         payload (FieldPatch): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         SessionOverview: Application service result.
     */
    patch: operations["edit_field_api_v1_sessions__session_id__stages__stage__fields__field__patch"];
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/stages/{stage}/reopen": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Reopen Stage
     * @description Reopen a previously visited stage, marking downstream stages stale.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         stage (Stage): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         SessionOverview: Application service result.
     */
    post: operations["reopen_stage_api_v1_sessions__session_id__stages__stage__reopen_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/sessions/{session_id}/turns": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Stream Turn
     * @description Stream analysis status, live reply deltas, committed state, and terminal result.
     *
     *     Args:
     *         session_id (str): Request parameter or session service.
     *         payload (PostMessageRequest): Request parameter or session service.
     *         service (Service): Request parameter or session service.
     *
     *     Returns:
     *         StreamingResponse: Application service result.
     */
    post: operations["stream_turn_api_v1_sessions__session_id__turns_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/healthz": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Healthcheck */
    get: operations["healthcheck_healthz_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/livez": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Livez */
    get: operations["livez_livez_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/metrics": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Metrics */
    get: operations["metrics_metrics_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/readyz": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Readyz */
    get: operations["readyz_readyz_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/chat/completions": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create Chat Completion
     * @description Process an OpenAI-compatible chat completion request.
     *
     *     Args:
     *         payload: OpenAI-compatible request payload.
     *         response: FastAPI response object used for response headers.
     *         settings: Application settings.
     *         session_service: Session application service.
     *
     *     Returns:
     *         OpenAIChatCompletionResponse | JSONResponse | StreamingResponse:
     *             Completion payload, stream, or OpenAI-shaped error.
     */
    post: operations["create_chat_completion_v1_chat_completions_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/models": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List Models
     * @description List the OpenAI-compatible models exposed by the backend.
     *
     *     Args:
     *         settings: Application settings.
     *
     *     Returns:
     *         OpenAIModelsResponse: Exposed public model aliases.
     */
    get: operations["list_models_v1_models_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/responses": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create Response
     * @description Process an OpenAI-compatible `/v1/responses` request.
     *
     *     Args:
     *         payload: OpenAI-compatible responses request payload.
     *         response: FastAPI response object used for response headers.
     *         settings: Application settings.
     *         session_service: Session application service.
     *
     *     Returns:
     *         OpenAIResponsesResponse | JSONResponse | StreamingResponse: Response payload or stream.
     */
    post: operations["create_response_v1_responses_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /**
     * AnalysisStatus
     * @description Analysis progress before conversational deltas.
     */
    AnalysisStatus: {
      /**
       * Status
       * @default running
       * @constant
       */
      status: "running";
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "analysis.status";
    };
    /**
     * AssistantTurnOutput
     * @description Structured assistant payload returned by the API.
     */
    AssistantTurnOutput: {
      /** Assistant Message */
      assistant_message: string;
      /** Assumptions */
      assumptions?: components["schemas"]["AssumptionItem"][];
      /**
       * Completion Tokens
       * @default 0
       */
      completion_tokens: number;
      /** Coverage */
      coverage?: {
        [key: string]: components["schemas"]["CoverageStatus"];
      };
      current_stage: components["schemas"]["Stage"];
      /** Decisions */
      decisions?: components["schemas"]["DecisionItem"][];
      /** Facts */
      facts?: components["schemas"]["FactItem"][];
      /** @default null */
      next_stage: components["schemas"]["Stage"] | null;
      /** Open Questions */
      open_questions?: components["schemas"]["OpenQuestionItem"][];
      /** @default null */
      pending_review: components["schemas"]["PendingHumanReview"] | null;
      processed_stage: components["schemas"]["Stage"];
      /**
       * Prompt Tokens
       * @default 0
       */
      prompt_tokens: number;
      /** Readiness */
      readiness?: components["schemas"]["ReadinessItem"][];
      /**
       * Requires Human Review
       * @default false
       */
      requires_human_review: boolean;
      /** Risks */
      risks?: components["schemas"]["RiskItem"][];
      /** Session Id */
      session_id: string;
      /** Stage Clear Enough */
      stage_clear_enough: boolean;
      /** Step Markdown */
      step_markdown: string;
      /** Summary */
      summary: string;
      /** Transition Decision Reason */
      transition_decision_reason: string;
      /** Uncertainties */
      uncertainties?: string[];
    };
    /**
     * AssumptionItem
     * @description Structured assumption captured during a turn.
     */
    AssumptionItem: {
      /**
       * Confidence
       * @default medium
       */
      confidence: string;
      /**
       * Default Field
       * @default null
       */
      default_field: string | null;
      /** Id */
      id?: string;
      /** Statement */
      statement: string;
      /**
       * To Confirm
       * @default true
       */
      to_confirm: boolean;
    };
    /**
     * BacklogExport
     * @description Validated backlog, effective dependencies and delivery waves.
     */
    BacklogExport: {
      backlog: components["schemas"]["BacklogFields"];
      /** Slices */
      slices: components["schemas"]["ExportedSlice"][];
      /** Waves */
      waves: string[][];
    };
    /**
     * BacklogFields
     * @description Stage 6 Backlog Synthesis contract.
     */
    BacklogFields: {
      /**
       * Cross Cutting Work
       * @description Cross cutting work
       * @default null
       */
      cross_cutting_work: components["schemas"]["BacklogItem"][] | null;
      /**
       * Mvp User Stories
       * @description Mvp user stories
       * @default null
       */
      mvp_user_stories: components["schemas"]["BacklogItem"][] | null;
      /**
       * Risk Spikes
       * @description Risk spikes
       * @default null
       */
      risk_spikes: components["schemas"]["BacklogItem"][] | null;
    };
    /**
     * BacklogItem
     * @description Identified backlog entry updated by id across turns.
     */
    BacklogItem: {
      /**
       * Capability
       * @default null
       */
      capability: string | null;
      /**
       * Definition Of Done
       * @default
       */
      definition_of_done: string;
      /** Ears Criteria */
      ears_criteria?: string[];
      /** Id */
      id?: string;
      /**
       * Link
       * @default
       */
      link: string;
      /**
       * Objective
       * @default
       */
      objective: string;
      /** Statement */
      statement: string;
    };
    /**
     * Benchmark
     * @description Immutable execution result with separately editable owner selection.
     */
    Benchmark: {
      /** Id */
      id: string;
      /** Queries */
      queries: string[];
      /** Results */
      results: components["schemas"]["SearchResult"][];
      /** Selected Ids */
      selected_ids?: string[];
      synthesis: components["schemas"]["ResearchSynthesis"];
      /** Version */
      version: number;
    };
    /**
     * CandidateFeature
     * @description An inferred recommendation requiring explicit owner selection.
     */
    CandidateFeature: {
      /** Evidence Urls */
      evidence_urls: string[];
      /** Feature */
      feature: string;
      /** Id */
      id?: string;
      /** Justification */
      justification: string;
      /** Products */
      products: string[];
      recommendation: components["schemas"]["Recommendation"];
    };
    /**
     * Clarification
     * @description Explicit answer to an identified question.
     */
    Clarification: {
      /** Answer */
      answer: string;
      /**
       * Created At
       * Format: date-time
       */
      created_at?: string;
      /** Question */
      question: string;
      /** Question Id */
      question_id: string;
    };
    /**
     * CommentInput
     * @description Section feedback for the next turn.
     */
    CommentInput: {
      /** Body */
      body: string;
      /** Section */
      section: string;
      stage: components["schemas"]["Stage"];
    };
    /**
     * ConversationHistoryResponse
     * @description Conversation history response.
     */
    ConversationHistoryResponse: {
      /** Items */
      items: components["schemas"]["ConversationTurn"][];
    };
    /**
     * ConversationTurn
     * @description Conversation message persisted in history.
     */
    ConversationTurn: {
      /**
       * Completion Tokens
       * @default 0
       */
      completion_tokens: number;
      /** Content */
      content: string;
      /**
       * Created At
       * Format: date-time
       */
      created_at?: string;
      /** Id */
      id?: string;
      /** @default text */
      modality: components["schemas"]["Modality"];
      /**
       * Prompt Tokens
       * @default 0
       */
      prompt_tokens: number;
      role: components["schemas"]["MessageRole"];
      /** Session Id */
      session_id: string;
      stage: components["schemas"]["Stage"];
    };
    /**
     * CoverageStatus
     * @description Field coverage owned by the deterministic validator.
     * @enum {string}
     */
    CoverageStatus: "clear" | "partial" | "missing";
    /**
     * CoverageUpdated
     * @description Authoritative persisted stage state, including gate data.
     */
    CoverageUpdated: {
      stage: components["schemas"]["StageState"];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "coverage.updated";
    };
    /**
     * CreateSessionInput
     * @description Optional creation metadata.
     */
    CreateSessionInput: {
      /**
       * Title
       * @default Untitled session
       */
      title: string;
    };
    /**
     * CreateSessionResponse
     * @description Response for session creation.
     */
    CreateSessionResponse: {
      current_stage: components["schemas"]["Stage"];
      /** Message */
      message: string;
      /** Session Id */
      session_id: string;
    };
    /**
     * CredentialsRequest
     * @description Credentials submitted by the trusted Next.js server.
     */
    CredentialsRequest: {
      /** Email */
      email: string;
      /** Password */
      password: string;
    };
    /**
     * DecisionItem
     * @description Structured decision captured during a turn.
     */
    DecisionItem: {
      /** Id */
      id?: string;
      /**
       * Rationale
       * @default null
       */
      rationale: string | null;
      /** Statement */
      statement: string;
    };
    /**
     * DeliveryContract
     * @description Shared interface with a stable identifier and concrete specification.
     */
    DeliveryContract: {
      /** Id */
      id: string;
      /** Specification */
      specification: string;
    };
    /**
     * DeliveryFields
     * @description Stage 7 contracts; waves are derived by the domain, never supplied by a model.
     */
    DeliveryFields: {
      /**
       * Slices
       * @description Vertical slices including slice-0 walking skeleton and shared contracts. Replace the complete slice list on update.
       * @default null
       */
      slices: components["schemas"]["DeliverySlice"][] | null;
    };
    /**
     * DeliverySlice
     * @description One independently developable delivery unit; slice-0 is the foundation.
     */
    DeliverySlice: {
      /** Backlog Item Ids */
      backlog_item_ids?: string[];
      /** Consumed Contracts */
      consumed_contracts?: string[];
      /** Dependencies */
      dependencies?: string[];
      /** Goal */
      goal: string;
      /** Id */
      id: string;
      /** Integration Scenarios */
      integration_scenarios?: components["schemas"]["IntegrationScenario"][];
      /** Owned Domain */
      owned_domain?: string[];
      /** Provided Contracts */
      provided_contracts?: components["schemas"]["DeliveryContract"][];
      /** Stubs */
      stubs?: string[];
    };
    /**
     * DocumentDiff
     * @description Unified line diff of two immutable versions of one stage.
     */
    DocumentDiff: {
      /** Diff */
      diff: string;
      /** From Version */
      from_version: number;
      stage: components["schemas"]["Stage"];
      /** To Version */
      to_version: number;
    };
    /**
     * DocumentUpdated
     * @description Committed document version.
     */
    DocumentUpdated: {
      document: components["schemas"]["StepDocument"];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "document.updated";
    };
    /**
     * DocumentsResponse
     * @description Versioned documents response.
     */
    DocumentsResponse: {
      /** Items */
      items: components["schemas"]["StepDocument"][];
    };
    /**
     * EventFields
     * @description Stage 3 Event Storming contract.
     */
    EventFields: {
      /**
       * Actors
       * @description Actors
       * @default null
       */
      actors: string[] | null;
      /**
       * Aggregates
       * @description Aggregates
       * @default null
       */
      aggregates: string[] | null;
      /**
       * Business Rules
       * @description Business rules
       * @default null
       */
      business_rules: string[] | null;
      /**
       * Commands
       * @description Commands
       * @default null
       */
      commands: string[] | null;
      /**
       * Complexity Hotspots
       * @description Complexity hotspots
       * @default null
       */
      complexity_hotspots: string[] | null;
      /**
       * Domain Events
       * @description Domain events
       * @default null
       */
      domain_events: string[] | null;
      /**
       * Event Storming Relevant
       * @description Event storming relevant
       * @default null
       */
      event_storming_relevant: boolean | null;
      /**
       * Not Relevant Reason
       * @description Not relevant reason
       * @default null
       */
      not_relevant_reason: string | null;
    };
    /**
     * ExportJsonResponse
     * @description Structured JSON export payload.
     */
    ExportJsonResponse: {
      /** Payload */
      payload: {
        [key: string]: unknown;
      };
      /** Session Id */
      session_id: string;
    };
    /**
     * ExportMarkdownResponse
     * @description Markdown export payload.
     */
    ExportMarkdownResponse: {
      /** Markdown */
      markdown: string;
      /** Session Id */
      session_id: string;
    };
    /**
     * ExportedSlice
     * @description Delivery slice enriched with its computed wave.
     */
    ExportedSlice: {
      /** Backlog Item Ids */
      backlog_item_ids?: string[];
      /** Consumed Contracts */
      consumed_contracts?: string[];
      /** Dependencies */
      dependencies?: string[];
      /** Goal */
      goal: string;
      /** Id */
      id: string;
      /** Integration Scenarios */
      integration_scenarios?: components["schemas"]["IntegrationScenario"][];
      /** Owned Domain */
      owned_domain?: string[];
      /** Provided Contracts */
      provided_contracts?: components["schemas"]["DeliveryContract"][];
      /** Stubs */
      stubs?: string[];
      /** Wave */
      wave: number;
    };
    /**
     * FactItem
     * @description Structured fact captured during a turn.
     */
    FactItem: {
      /** Id */
      id?: string;
      /**
       * Source
       * @default user
       */
      source: string;
      /** Statement */
      statement: string;
    };
    /**
     * FeatureSelection
     * @description Replacement selection for a specific benchmark version.
     */
    FeatureSelection: {
      /** Selected Ids */
      selected_ids: string[];
    };
    /**
     * FieldPatch
     * @description A typed JSON value; the selected stage contract validates its type.
     */
    FieldPatch: {
      /** Value */
      value: unknown;
    };
    /** HTTPValidationError */
    HTTPValidationError: {
      /** Detail */
      detail?: components["schemas"]["ValidationError"][];
    };
    /**
     * HumanReviewDecision
     * @description Decision taken during optional human review.
     * @enum {string}
     */
    HumanReviewDecision: "approved" | "rejected" | "request_changes";
    /**
     * HumanReviewRecord
     * @description Persisted human review decision.
     */
    HumanReviewRecord: {
      /**
       * Created At
       * Format: date-time
       */
      created_at?: string;
      decision: components["schemas"]["HumanReviewDecision"];
      from_stage: components["schemas"]["Stage"];
      /** Id */
      id?: string;
      /** Note */
      note?: string | null;
      proposed_next_stage: components["schemas"]["Stage"] | null;
      /** Session Id */
      session_id: string;
    };
    /**
     * HumanReviewRequest
     * @description Request payload for approving or rejecting a pending transition.
     */
    HumanReviewRequest: {
      decision: components["schemas"]["HumanReviewDecision"];
      /** Note */
      note?: string | null;
    };
    /**
     * HumanReviewsResponse
     * @description List of human review decisions for a session.
     */
    HumanReviewsResponse: {
      /** Items */
      items: components["schemas"]["HumanReviewRecord"][];
    };
    /**
     * ImpactFields
     * @description Stage 4 Impact Mapping contract.
     */
    ImpactFields: {
      /**
       * Business Goal
       * @description Business goal
       * @default null
       */
      business_goal: string | null;
      /**
       * Deliverables
       * @description Deliverables
       * @default null
       */
      deliverables: string[] | null;
      /**
       * Expected Behaviors
       * @description Expected behaviors
       * @default null
       */
      expected_behaviors: string[] | null;
      /**
       * Influential Actors
       * @description Influential actors
       * @default null
       */
      influential_actors: string[] | null;
      /**
       * Value Hypotheses
       * @description Value hypotheses
       * @default null
       */
      value_hypotheses: string[] | null;
    };
    /**
     * IntegrationScenario
     * @description An executable integration example in GWT or EARS form.
     */
    IntegrationScenario: {
      /**
       * Ears
       * @default null
       */
      ears: string | null;
      /**
       * Given
       * @default
       */
      given: string;
      /**
       * Then
       * @default
       */
      then: string;
      /**
       * When
       * @default
       */
      when: string;
    };
    /**
     * MessageDelta
     * @description An incremental conversational provider delta.
     */
    MessageDelta: {
      /** Delta */
      delta: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "message.delta";
    };
    /**
     * MessageRole
     * @description Conversation roles.
     * @enum {string}
     */
    MessageRole: "user" | "assistant";
    /**
     * Modality
     * @description Supported input modalities.
     * @enum {string}
     */
    Modality: "text";
    /**
     * OIDCRequest
     * @description Claims already verified by the trusted Next.js OIDC callback.
     */
    OIDCRequest: {
      /** Display Name */
      display_name: string;
      /** Email */
      email: string;
      /** Issuer */
      issuer: string;
      /** Subject */
      subject: string;
    };
    /**
     * OpenAIBrainstormPayload
     * @description Additional state payload returned by the brainstorming facade.
     */
    OpenAIBrainstormPayload: {
      current_stage: components["schemas"]["Stage"];
      next_stage: components["schemas"]["Stage"] | null;
      /** Open Questions */
      open_questions: components["schemas"]["OpenQuestionItem"][];
      processed_stage: components["schemas"]["Stage"];
      /** Session Id */
      session_id: string;
      /** Stage Clear Enough */
      stage_clear_enough: boolean;
      /** Summary */
      summary: string;
      /** Transition Decision Reason */
      transition_decision_reason: string;
    };
    /**
     * OpenAIChatCompletionRequest
     * @description OpenAI-compatible chat completion request.
     */
    OpenAIChatCompletionRequest: {
      /** Messages */
      messages: components["schemas"]["OpenAIChatMessage"][];
      /** Metadata */
      metadata?: {
        [key: string]: unknown;
      };
      /** Model */
      model: string;
      /**
       * Stream
       * @default false
       */
      stream: boolean;
      /** User */
      user?: string | null;
    };
    /**
     * OpenAIChatCompletionResponse
     * @description OpenAI-compatible chat completion response.
     */
    OpenAIChatCompletionResponse: {
      brainstorm: components["schemas"]["OpenAIBrainstormPayload"];
      /** Choices */
      choices: components["schemas"]["OpenAICompletionChoice"][];
      /** Created */
      created?: number;
      /** Id */
      id?: string;
      /** Model */
      model: string;
      /**
       * Object
       * @default chat.completion
       */
      object: string;
      usage: components["schemas"]["OpenAIUsage"];
    };
    /**
     * OpenAIChatMessage
     * @description OpenAI-compatible chat message.
     */
    OpenAIChatMessage: {
      /** Content */
      content: string | components["schemas"]["OpenAIContentPart"][] | null;
      /**
       * Role
       * @enum {string}
       */
      role: "system" | "developer" | "user" | "assistant" | "tool";
    };
    /**
     * OpenAICompletionChoice
     * @description Choice payload for OpenAI-compatible chat completions.
     */
    OpenAICompletionChoice: {
      /**
       * Finish Reason
       * @default stop
       */
      finish_reason: string;
      /**
       * Index
       * @default 0
       */
      index: number;
      message: components["schemas"]["OpenAICompletionMessage"];
    };
    /**
     * OpenAICompletionMessage
     * @description Assistant message in OpenAI-compatible completion responses.
     */
    OpenAICompletionMessage: {
      /** Content */
      content: string;
      /**
       * Role
       * @default assistant
       * @constant
       */
      role: "assistant";
    };
    /**
     * OpenAIContentPart
     * @description Text content part for OpenAI-compatible chat messages.
     */
    OpenAIContentPart: {
      /** Text */
      text?: string | null;
      /** Type */
      type: string;
    };
    /**
     * OpenAIModelCard
     * @description OpenAI-compatible model card.
     */
    OpenAIModelCard: {
      /** Created */
      created: number;
      /** Id */
      id: string;
      /**
       * Object
       * @default model
       */
      object: string;
      /**
       * Owned By
       * @default brainstorm-agent
       */
      owned_by: string;
    };
    /**
     * OpenAIModelsResponse
     * @description OpenAI-compatible models listing.
     */
    OpenAIModelsResponse: {
      /** Data */
      data: components["schemas"]["OpenAIModelCard"][];
      /**
       * Object
       * @default list
       */
      object: string;
    };
    /**
     * OpenAIResponseOutputMessage
     * @description Output message in `/v1/responses` responses.
     */
    OpenAIResponseOutputMessage: {
      /** Content */
      content: components["schemas"]["OpenAIResponseOutputText"][];
      /** Id */
      id?: string;
      /**
       * Role
       * @default assistant
       * @constant
       */
      role: "assistant";
      /**
       * Type
       * @default message
       * @constant
       */
      type: "message";
    };
    /**
     * OpenAIResponseOutputText
     * @description Text content item in OpenAI-compatible response output.
     */
    OpenAIResponseOutputText: {
      /** Text */
      text: string;
      /**
       * Type
       * @default output_text
       * @constant
       */
      type: "output_text";
    };
    /**
     * OpenAIResponsesInputMessage
     * @description OpenAI-compatible item for the `/v1/responses` input list.
     */
    OpenAIResponsesInputMessage: {
      /** Content */
      content: string | components["schemas"]["OpenAIContentPart"][] | null;
      /**
       * Role
       * @enum {string}
       */
      role: "system" | "developer" | "user" | "assistant" | "tool";
    };
    /**
     * OpenAIResponsesRequest
     * @description OpenAI-compatible request payload for `/v1/responses`.
     */
    OpenAIResponsesRequest: {
      /** Input */
      input: string | components["schemas"]["OpenAIResponsesInputMessage"][];
      /** Metadata */
      metadata?: {
        [key: string]: unknown;
      };
      /** Model */
      model: string;
      /**
       * Stream
       * @default false
       */
      stream: boolean;
      /** User */
      user?: string | null;
    };
    /**
     * OpenAIResponsesResponse
     * @description OpenAI-compatible `/v1/responses` payload.
     */
    OpenAIResponsesResponse: {
      brainstorm: components["schemas"]["OpenAIBrainstormPayload"];
      /** Created At */
      created_at?: number;
      /** Id */
      id?: string;
      /** Model */
      model: string;
      /**
       * Object
       * @default response
       * @constant
       */
      object: "response";
      /** Output */
      output: components["schemas"]["OpenAIResponseOutputMessage"][];
      usage: components["schemas"]["OpenAIUsage"];
    };
    /**
     * OpenAIUsage
     * @description Approximate token usage payload.
     */
    OpenAIUsage: {
      /** Completion Tokens */
      completion_tokens: number;
      /** Prompt Tokens */
      prompt_tokens: number;
      /** Total Tokens */
      total_tokens: number;
    };
    /**
     * OpenQuestionItem
     * @description Structured open question captured during a turn.
     */
    OpenQuestionItem: {
      /**
       * Blocking
       * @default true
       */
      blocking: boolean;
      /**
       * Field
       * @default null
       */
      field: string | null;
      /** Id */
      id?: string;
      /** Options */
      options?: string[];
      /** @default scope */
      priority: components["schemas"]["QuestionPriority"];
      /** Question */
      question: string;
      /**
       * Recommended Option
       * @default null
       */
      recommended_option: string | null;
      /** @default open */
      status: components["schemas"]["OpenQuestionStatus"];
      /**
       * Why It Matters
       * @default Required to resolve a stage uncertainty.
       */
      why_it_matters: string | null;
    };
    /**
     * OpenQuestionStatus
     * @description Lifecycle for open questions.
     * @enum {string}
     */
    OpenQuestionStatus: "open" | "resolved";
    /**
     * PendingHumanReview
     * @description Pending transition awaiting explicit human review.
     */
    PendingHumanReview: {
      from_stage: components["schemas"]["Stage"];
      /**
       * Requested At
       * Format: date-time
       */
      requested_at?: string;
      /** Summary */
      summary: string;
      to_stage: components["schemas"]["Stage"] | null;
      /** Transition Decision Reason */
      transition_decision_reason: string;
    };
    /**
     * PitchFields
     * @description Stage 0 Pitch contract.
     */
    PitchFields: {
      /**
       * Ambiguities
       * @description Ambiguities
       * @default null
       */
      ambiguities: string[] | null;
      /**
       * Clear Points
       * @description Clear points
       * @default null
       */
      clear_points: string[] | null;
      /**
       * Missing Information
       * @description Missing information
       * @default null
       */
      missing_information: string[] | null;
      /**
       * Pitch Summary
       * @description Pitch summary
       * @default null
       */
      pitch_summary: string | null;
    };
    /**
     * PostMessageRequest
     * @description Request payload for a user message.
     */
    PostMessageRequest: {
      /** Content */
      content: string;
      /** @default text */
      modality: components["schemas"]["Modality"];
    };
    /**
     * PostMessageResponse
     * @description Response payload for one processed turn.
     */
    PostMessageResponse: {
      /** Assistant Message */
      assistant_message: string;
      /** Assumptions */
      assumptions: components["schemas"]["AssumptionItem"][];
      /**
       * Completion Tokens
       * @default 0
       */
      completion_tokens: number;
      current_stage: components["schemas"]["Stage"];
      /** Decisions */
      decisions: components["schemas"]["DecisionItem"][];
      /** Facts */
      facts: components["schemas"]["FactItem"][];
      next_stage: components["schemas"]["Stage"] | null;
      /** Open Questions */
      open_questions: components["schemas"]["OpenQuestionItem"][];
      pending_review?: components["schemas"]["PendingHumanReview"] | null;
      processed_stage: components["schemas"]["Stage"];
      /**
       * Prompt Tokens
       * @default 0
       */
      prompt_tokens: number;
      /**
       * Requires Human Review
       * @default false
       */
      requires_human_review: boolean;
      /** Risks */
      risks: components["schemas"]["RiskItem"][];
      /** Session Id */
      session_id: string;
      /** Stage Clear Enough */
      stage_clear_enough: boolean;
      /** Step Markdown */
      step_markdown: string;
      /** Summary */
      summary: string;
      /** Transition Decision Reason */
      transition_decision_reason: string;
      /** Uncertainties */
      uncertainties: string[];
    };
    /**
     * ProblemFields
     * @description Stage 1 Problem Framing contract.
     */
    ProblemFields: {
      /**
       * Constraints
       * @description Constraints
       * @default null
       */
      constraints: string[] | null;
      /**
       * Five W One H
       * @description Five w one h
       * @default null
       */
      five_w_one_h: string | null;
      /**
       * Hypotheses
       * @description Hypotheses
       * @default null
       */
      hypotheses: string[] | null;
      /**
       * Initial Risks
       * @description Initial risks
       * @default null
       */
      initial_risks: string[] | null;
      /**
       * Measurable Objectives
       * @description Measurable objectives
       * @default null
       */
      measurable_objectives: string[] | null;
      /**
       * Non Goals
       * @description Non goals
       * @default null
       */
      non_goals: string[] | null;
      /**
       * Problem Statement
       * @description Problem statement
       * @default null
       */
      problem_statement: string | null;
      /**
       * Users Actors
       * @description Users actors
       * @default null
       */
      users_actors: string[] | null;
    };
    /**
     * Product
     * @description Sourced observations of an existing product.
     */
    Product: {
      /** Evidence Urls */
      evidence_urls: string[];
      /** Key Features */
      key_features: string[];
      /** Name */
      name: string;
      /** Pricing */
      pricing: string | null;
      /** Summary */
      summary: string;
      /**
       * Url
       * Format: uri
       */
      url: string;
    };
    /**
     * QuestionPriority
     * @description Ordered elicitation topics.
     * @enum {string}
     */
    QuestionPriority: "scope" | "security/compliance" | "ux" | "technical";
    /**
     * ReadinessItem
     * @description One deterministic checklist outcome.
     */
    ReadinessItem: {
      /** Id */
      id: string;
      /** Message */
      message: string;
      /** Passed */
      passed: boolean;
    };
    /**
     * Recommendation
     * @description Owner-facing recommendation, never an automatic decision.
     * @enum {string}
     */
    Recommendation: "adopt" | "adapt" | "skip";
    /**
     * ResearchSynthesis
     * @description Untrusted model synthesis, checked against actual search evidence.
     */
    ResearchSynthesis: {
      /** Assumptions */
      assumptions: string[];
      /** Features */
      features: components["schemas"]["CandidateFeature"][];
      /** Open Questions */
      open_questions: string[];
      /** Products */
      products: components["schemas"]["Product"][];
    };
    /**
     * ReviewAction
     * @description Explicit owner review choices.
     * @enum {string}
     */
    ReviewAction: "approve" | "reject" | "request_changes";
    /**
     * ReviewInput
     * @description Review of the currently pending stage, with an optional note.
     */
    ReviewInput: {
      action: components["schemas"]["ReviewAction"];
      /** Note */
      note?: string | null;
      stage: components["schemas"]["Stage"];
    };
    /**
     * ReviewRequired
     * @description Transition awaits owner review.
     */
    ReviewRequired: {
      review: components["schemas"]["PendingHumanReview"];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "review.required";
    };
    /**
     * RiskField
     * @description Typed risk field with stable identity.
     */
    RiskField: {
      /** Action */
      action: string;
      /** Category */
      category: string;
      /** Description */
      description: string;
      /** Id */
      id?: string;
      /** Impact */
      impact: string;
      /** Mitigation */
      mitigation: string;
      /** Probability */
      probability: string;
    };
    /**
     * RiskFields
     * @description Stage 5 Risk Storming contract.
     */
    RiskFields: {
      /**
       * Risks By Category
       * @description Risks by category
       * @default null
       */
      risks_by_category: components["schemas"]["RiskField"][] | null;
    };
    /**
     * RiskItem
     * @description Structured risk captured during a turn.
     */
    RiskItem: {
      /** Action */
      action: string;
      /** Category */
      category: string;
      /** Description */
      description: string;
      /** Id */
      id?: string;
      /** Impact */
      impact: string;
      /** Mitigation */
      mitigation: string;
      /** Probability */
      probability: string;
    };
    /**
     * SearchResult
     * @description Normalized snippet; pages are never fetched.
     */
    SearchResult: {
      /** Provider */
      provider: string;
      /** Snippet */
      snippet: string;
      /** Title */
      title: string;
      /**
       * Url
       * Format: uri
       */
      url: string;
    };
    /**
     * SectionComment
     * @description Owner annotation consumed as context by the next successful turn.
     */
    SectionComment: {
      /** Body */
      body: string;
      /**
       * Consumed
       * @default false
       */
      consumed: boolean;
      /**
       * Created At
       * Format: date-time
       */
      created_at?: string;
      /** Id */
      id?: string;
      /** Section */
      section: string;
      stage: components["schemas"]["Stage"];
    };
    /**
     * SessionOverview
     * @description Session snapshot returned by the API.
     */
    SessionOverview: {
      /**
       * Archived
       * @default false
       */
      archived: boolean;
      /** Comments */
      comments?: components["schemas"]["SectionComment"][];
      /** Completed Stages */
      completed_stages?: components["schemas"]["Stage"][];
      /**
       * Created At
       * Format: date-time
       */
      created_at: string;
      current_stage: components["schemas"]["Stage"];
      /** Open Questions */
      open_questions?: components["schemas"]["OpenQuestionItem"][];
      pending_human_review?: components["schemas"]["PendingHumanReview"] | null;
      /** Session Id */
      session_id: string;
      /** Stage States */
      stage_states?: {
        [key: string]: components["schemas"]["StageState"];
      };
      /**
       * Title
       * @default Untitled session
       */
      title: string;
      /**
       * Updated At
       * Format: date-time
       */
      updated_at: string;
    };
    /**
     * SessionPage
     * @description Stable offset pagination ordered by creation time and id.
     */
    SessionPage: {
      /** Items */
      items: components["schemas"]["SessionOverview"][];
      /** Limit */
      limit: number;
      /** Offset */
      offset: number;
      /** Total */
      total: number;
    };
    /**
     * SessionPatch
     * @description Editable session metadata.
     */
    SessionPatch: {
      /** Archived */
      archived?: boolean | null;
      /** Title */
      title?: string | null;
    };
    /**
     * SessionResponse
     * @description Detailed session response.
     */
    SessionResponse: {
      /**
       * Archived
       * @default false
       */
      archived: boolean;
      /** Comments */
      comments?: components["schemas"]["SectionComment"][];
      /** Completed Stages */
      completed_stages?: components["schemas"]["Stage"][];
      /**
       * Created At
       * Format: date-time
       */
      created_at: string;
      current_stage: components["schemas"]["Stage"];
      /** Open Questions */
      open_questions?: components["schemas"]["OpenQuestionItem"][];
      pending_human_review?: components["schemas"]["PendingHumanReview"] | null;
      /** Session Id */
      session_id: string;
      /** Stage States */
      stage_states?: {
        [key: string]: components["schemas"]["StageState"];
      };
      /**
       * Title
       * @default Untitled session
       */
      title: string;
      /**
       * Updated At
       * Format: date-time
       */
      updated_at: string;
    };
    /**
     * SliceSpecsExport
     * @description Standalone Markdown artifacts keyed by safe slice filename.
     */
    SliceSpecsExport: {
      /**
       * Available
       * @default true
       * @constant
       */
      available: true;
      /** Specs */
      specs: {
        [key: string]: string;
      };
    };
    /**
     * Stage
     * @description Ordered brainstorming stages.
     * @enum {string}
     */
    Stage:
      | "stage_0_pitch"
      | "stage_1_problem_framing"
      | "stage_2_user_story_mapping"
      | "stage_3_event_storming"
      | "stage_4_impact_mapping"
      | "stage_5_risk_storming"
      | "stage_6_backlog_synthesis"
      | "stage_7_delivery_slicing";
    /**
     * StageChanged
     * @description Committed stage transition.
     */
    StageChanged: {
      from_stage: components["schemas"]["Stage"];
      to_stage: components["schemas"]["Stage"];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "stage.changed";
    };
    StageFields:
      | components["schemas"]["PitchFields"]
      | components["schemas"]["ProblemFields"]
      | components["schemas"]["StoryMapFields"]
      | components["schemas"]["EventFields"]
      | components["schemas"]["ImpactFields"]
      | components["schemas"]["RiskFields"]
      | components["schemas"]["BacklogFields"]
      | components["schemas"]["DeliveryFields"];
    /**
     * StagePatch
     * @description Replace supplied fields or identified item collections, then validate.
     */
    StagePatch: {
      /** Fields */
      fields?: {
        [key: string]: unknown;
      };
      /** Items */
      items?: {
        [key: string]: {
          [key: string]: unknown;
        }[];
      };
    };
    /**
     * StageState
     * @description Current structured state for one stage.
     */
    StageState: {
      /**
       * Assistant Message
       * @default
       */
      assistant_message: string;
      /** Assumptions */
      assumptions?: components["schemas"]["AssumptionItem"][];
      /** Clarifications */
      clarifications?: components["schemas"]["Clarification"][];
      /** Contradictions */
      contradictions?: string[];
      /** Coverage */
      coverage?: {
        [key: string]: components["schemas"]["CoverageStatus"];
      };
      /** Decisions */
      decisions?: components["schemas"]["DecisionItem"][];
      extracted_fields?: components["schemas"]["StageFields"];
      /** Facts */
      facts?: components["schemas"]["FactItem"][];
      /**
       * Latest Markdown
       * @default
       */
      latest_markdown: string;
      /** Open Questions */
      open_questions?: components["schemas"]["OpenQuestionItem"][];
      /** Partial Fields */
      partial_fields?: {
        [key: string]: string;
      };
      /** Readiness */
      readiness?: components["schemas"]["ReadinessItem"][];
      /** Risks */
      risks?: components["schemas"]["RiskItem"][];
      stage: components["schemas"]["Stage"];
      /**
       * Stage Is Clear Enough
       * @default false
       */
      stage_is_clear_enough: boolean;
      /**
       * Stale
       * @default false
       */
      stale: boolean;
      /**
       * Summary
       * @default
       */
      summary: string;
      /**
       * Transition Decision Reason
       * @default
       */
      transition_decision_reason: string;
      /** Uncertainties */
      uncertainties?: string[];
      /**
       * Updated At
       * Format: date-time
       */
      updated_at?: string;
    };
    /**
     * StepDocument
     * @description Rendered Markdown artifact for a stage turn.
     */
    StepDocument: {
      /** Assumptions */
      assumptions?: components["schemas"]["AssumptionItem"][];
      /**
       * Created At
       * Format: date-time
       */
      created_at?: string;
      /** Decisions */
      decisions?: components["schemas"]["DecisionItem"][];
      /** Facts */
      facts?: components["schemas"]["FactItem"][];
      /** Id */
      id?: string;
      /** Markdown */
      markdown: string;
      /** Open Questions */
      open_questions?: components["schemas"]["OpenQuestionItem"][];
      /** Risks */
      risks?: components["schemas"]["RiskItem"][];
      /** Session Id */
      session_id: string;
      stage: components["schemas"]["Stage"];
      /** Summary */
      summary: string;
      /** Uncertainties */
      uncertainties?: string[];
      /** Version */
      version: number;
    };
    /**
     * StoryMapFields
     * @description Stage 2 User Story Mapping contract.
     */
    StoryMapFields: {
      /**
       * Actors Personas
       * @description Actors personas
       * @default null
       */
      actors_personas: string[] | null;
      /**
       * Capabilities
       * @description Capabilities
       * @default null
       */
      capabilities: string[] | null;
      /**
       * Dependencies
       * @description Dependencies
       * @default null
       */
      dependencies: string[] | null;
      /**
       * Edge Cases
       * @description Edge cases
       * @default null
       */
      edge_cases: string[] | null;
      /**
       * Functional Gaps
       * @description Functional gaps
       * @default null
       */
      functional_gaps: string[] | null;
      /**
       * Mvp Scope
       * @description Mvp scope
       * @default null
       */
      mvp_scope: string[] | null;
      /**
       * User Journeys
       * @description User journeys
       * @default null
       */
      user_journeys: string[] | null;
    };
    /**
     * TurnCompleted
     * @description Terminal success, emitted only after commit.
     */
    TurnCompleted: {
      output: components["schemas"]["AssistantTurnOutput"];
      /** Turn Id */
      turn_id: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "turn.completed";
    };
    /**
     * TurnError
     * @description Terminal failure; tentative deltas must be discarded.
     */
    TurnError: {
      /**
       * Code
       * @default turn_failed
       * @constant
       */
      code: "turn_failed";
      /**
       * Message
       * @default The turn failed; retry the request.
       */
      message: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "error";
    };
    TurnEvent:
      | components["schemas"]["TurnStarted"]
      | components["schemas"]["AnalysisStatus"]
      | components["schemas"]["MessageDelta"]
      | components["schemas"]["DocumentUpdated"]
      | components["schemas"]["CoverageUpdated"]
      | components["schemas"]["StageChanged"]
      | components["schemas"]["ReviewRequired"]
      | components["schemas"]["TurnCompleted"]
      | components["schemas"]["TurnError"];
    /**
     * TurnStarted
     * @description First event of an accepted stream.
     */
    TurnStarted: {
      stage: components["schemas"]["Stage"];
      /** Turn Id */
      turn_id: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "turn.started";
    };
    /**
     * UserResponse
     * @description Public identity; password hashes never leave the backend.
     */
    UserResponse: {
      /** Display Name */
      display_name: string;
      /** Email */
      email: string;
      /** Id */
      id: string;
    };
    /** ValidationError */
    ValidationError: {
      /** Context */
      ctx?: Record<string, never>;
      /** Input */
      input?: unknown;
      /** Location */
      loc: (string | number)[];
      /** Message */
      msg: string;
      /** Error Type */
      type: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  provision_oidc_api_v1_auth_oidc_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["OIDCRequest"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["UserResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  verify_credentials_api_v1_auth_verify_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CredentialsRequest"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["UserResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  list_sessions_api_v1_sessions_get: {
    parameters: {
      query?: {
        offset?: number;
        limit?: number;
        include_archived?: boolean;
      };
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionPage"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  create_session_api_v1_sessions_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        "application/json": components["schemas"]["CreateSessionInput"] | null;
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["CreateSessionResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  get_session_api_v1_sessions__session_id__get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  delete_session_api_v1_sessions__session_id__delete: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  update_session_api_v1_sessions__session_id__patch: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["SessionPatch"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionOverview"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  add_comment_api_v1_sessions__session_id__comments_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CommentInput"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionOverview"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  get_current_document_api_v1_sessions__session_id__document_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["StepDocument"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  list_documents_api_v1_sessions__session_id__documents_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DocumentsResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  export_backlog_api_v1_sessions__session_id__export_backlog_json_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["BacklogExport"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  export_json_api_v1_sessions__session_id__export_json_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ExportJsonResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  export_markdown_api_v1_sessions__session_id__export_markdown_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ExportMarkdownResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  export_specs_api_v1_sessions__session_id__export_slice_specs_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SliceSpecsExport"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  list_messages_api_v1_sessions__session_id__messages_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ConversationHistoryResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  post_message_api_v1_sessions__session_id__messages_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["PostMessageRequest"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["PostMessageResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  post_message_stream_api_v1_sessions__session_id__messages_stream_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["PostMessageRequest"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  research_history_api_v1_sessions__session_id__research_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          };
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  research_products_api_v1_sessions__session_id__research_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  select_research_features_api_v1_sessions__session_id__research__benchmark_id__selection_patch: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
        benchmark_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["FeatureSelection"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Benchmark"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  submit_review_api_v1_sessions__session_id__review_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ReviewInput"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionOverview"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  list_human_reviews_api_v1_sessions__session_id__reviews_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HumanReviewsResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  review_pending_transition_api_v1_sessions__session_id__reviews_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["HumanReviewRequest"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  edit_stage_api_v1_sessions__session_id__stages__stage__patch: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
        stage: components["schemas"]["Stage"];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["StagePatch"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionOverview"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  stage_documents_api_v1_sessions__session_id__stages__stage__documents_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
        stage: components["schemas"]["Stage"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["StepDocument"][];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  document_diff_api_v1_sessions__session_id__stages__stage__documents_diff_get: {
    parameters: {
      query: {
        from_version: number;
        to_version: number;
      };
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
        stage: components["schemas"]["Stage"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DocumentDiff"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  edit_field_api_v1_sessions__session_id__stages__stage__fields__field__patch: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
        stage: components["schemas"]["Stage"];
        field: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["FieldPatch"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionOverview"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  reopen_stage_api_v1_sessions__session_id__stages__stage__reopen_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
        stage: components["schemas"]["Stage"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionOverview"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  stream_turn_api_v1_sessions__session_id__turns_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["PostMessageRequest"];
      };
    };
    responses: {
      /** @description SSE: event is the discriminant, data is JSON. Deltas are tentative until turn.completed. Exactly one terminal event: turn.completed or error. No replay/resume support. While the turn is silent, a `: keepalive` SSE comment is sent every 15 s; clients ignore it. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": unknown;
          "text/event-stream": components["schemas"]["TurnEvent"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  healthcheck_healthz_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          };
        };
      };
    };
  };
  livez_livez_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: string;
          };
        };
      };
    };
  };
  metrics_metrics_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "text/plain": string;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  readyz_readyz_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            [key: string]: unknown;
          };
        };
      };
    };
  };
  create_chat_completion_v1_chat_completions_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["OpenAIChatCompletionRequest"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["OpenAIChatCompletionResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  list_models_v1_models_get: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["OpenAIModelsResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
  create_response_v1_responses_post: {
    parameters: {
      query?: never;
      header?: {
        "X-API-Key"?: string | null;
        Authorization?: string | null;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["OpenAIResponsesRequest"];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["OpenAIResponsesResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
    };
  };
}
