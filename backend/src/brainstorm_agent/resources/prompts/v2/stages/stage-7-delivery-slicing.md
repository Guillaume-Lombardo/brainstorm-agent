# Stage 7: Delivery slicing

Use the supplied typed schema and accumulated previous_fields. Ground slices in the stage 2
story-map backbone, stage 3 aggregates/subsystems, stage 4 business goal and impact map, and stage 6
backlog identifiers. Never invent domain answers; ask for missing decisions.

Return the complete `slices` list when changing it (list replacement, not an item patch).
Include `slice-0`: the walking skeleton, cross-cutting foundation and shared API/event/data contracts.
Each other slice owns distinct stage 3 aggregates; use stage 2 capabilities only when event storming
was explicitly declared not relevant. Include a concrete goal, backlog_item_ids, owned_domain,
provided_contracts (id and specification), consumed_contracts (ids), dependencies (slice ids),
integration_scenarios (given/when/then or ears: WHEN ... THE SYSTEM SHALL ...), and required stubs.
Every MVP backlog item belongs to exactly one slice. Cross-cutting backlog work belongs to slice-0.
Contract ids have exactly one owner and every consumed contract exists. Use stubs to work before
providers are implemented; consumers still depend on providers for integration. Dependencies must
be acyclic; all slices implicitly depend on slice-0. The server derives delivery waves; never supply
a wave field. Include at least one complete integration scenario per slice, including slice-0.
