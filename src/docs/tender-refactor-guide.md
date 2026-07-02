# Tender Module Refactor Guide

You are refactoring a React + TypeScript CRM tender/proposal module.

## Goal

Refactor the tender module into smaller, maintainable files without changing behavior.

Do not change:

* UI
* API calls
* routes
* translations
* validations
* business logic
* permissions
* optimistic updates
* manual save behavior
* keyboard behavior
* loading behavior

## Important Files

Main files:

* `src/pages/tenders/detail/TenderDetail.tsx`
* `src/pages/tenders/detail/TenderCreate.tsx`
* `src/pages/tenders/detail/TenderRichText.tsx`
* `src/pages/tenders/detail/TenderLogsPanel.tsx`
* `src/pages/tenders/detail/TenderTechnicianTab.tsx`
* `src/pages/tenders/detail/TenderDetailComponents.tsx`
* `src/pages/tenders/detail/tenderDetailUtils.ts`
* `src/pages/tenders/TenderList.tsx`
* `src/pages/tenders/TenderReport.tsx`

## Target Architecture

Use this general structure:

```txt
src/pages/tenders/
│
├── TenderList.tsx
├── TenderReport.tsx
│
└── detail/
    ├── TenderDetail.tsx
    ├── TenderCreate.tsx
    ├── index.ts
    │
    ├── components/
    │   ├── TenderDetailHeader.tsx
    │   ├── TenderDetailToolbar.tsx
    │   ├── TenderWorkspaceTabs.tsx
    │   ├── TenderLineTable.tsx
    │   ├── TenderLineRow.tsx
    │   ├── TenderLineInputs.tsx
    │   ├── TenderProductPickerModal.tsx
    │   ├── TenderManualProductModal.tsx
    │   ├── TenderAddressSection.tsx
    │   ├── TenderCustomerSection.tsx
    │   ├── TenderProfitabilityPanel.tsx
    │   ├── TenderLogsPanel.tsx
    │   ├── TenderDocumentPreviewModal.tsx
    │   ├── TenderOrderDecisionModal.tsx
    │   ├── TenderBulkDeleteModal.tsx
    │   ├── TenderBulkDiscountModal.tsx
    │   ├── TenderTechnicianTab.tsx
    │   └── RichTextMarkdownEditor.tsx
    │
    ├── hooks/
    │   ├── useLanguageRefresh.ts
    │   ├── useTenderLineEditing.ts
    │   ├── useTenderLineKeyboardNavigation.ts
    │   ├── useTenderSaving.ts
    │   ├── useTenderCustomers.ts
    │   ├── useTenderAddresses.ts
    │   ├── useTenderProducts.ts
    │   ├── useTenderDocuments.ts
    │   ├── useTenderChatter.ts
    │   ├── useTenderOrderActions.ts
    │   └── useTenderProfitability.ts
    │
    ├── utils/
    │   ├── tenderDetail.constants.ts
    │   ├── tenderLine.utils.ts
    │   ├── tenderCalculation.utils.ts
    │   ├── tenderProduct.utils.ts
    │   ├── tenderAddress.utils.ts
    │   ├── tenderDocument.utils.ts
    │   ├── tenderLog.utils.ts
    │   ├── tenderStatus.utils.ts
    │   ├── markdown.utils.ts
    │   └── formatters.ts
    │
    └── types/
        └── tenderDetail.types.ts
```

## Dependency Rules

Follow this dependency direction:

* pages may import hooks, components, utils, types, constants
* components may import utils, types, constants
* hooks may import APIs, stores, utils, types, constants
* utils must not import React components
* utils should not mutate stores unless explicitly marked as store helpers
* types must not import runtime code
* constants must not import components
* avoid circular imports

## Refactor Order

Work in small safe steps.

### Step 1

Move shared types and constants.

Do not move JSX or stateful logic yet.

### Step 2

Move pure utility functions.

Examples:

* line helpers
* calculation helpers
* address helpers
* document helpers
* product helpers
* markdown helpers
* status helpers
* formatters

### Step 3

Split `TenderRichText.tsx`.

Move markdown parsing/cache logic to utilities.

Keep old imports working by re-exporting from `TenderRichText.tsx`.

### Step 4

Move inline line input components.

Move:

* `BufferedTextInput`
* `BufferedNumberInput`
* `InlineDescriptionEditor`

to `components/TenderLineInputs.tsx`.

Preserve:

* Enter behavior
* Escape behavior
* ArrowUp / ArrowDown behavior
* focus/select behavior
* memoization

### Step 5

Extract presentational components.

Do not move business logic yet.

### Step 6

Extract custom hooks one by one.

Avoid creating one giant hook.

### Step 7

Shrink `TenderDetail.tsx` into a page orchestrator.

It should mainly:

* read route params
* compose layout
* connect hooks
* pass props to child components

### Step 8

Clean imports and remove unused code.

Run TypeScript checks after every step.

## Required Output Before Editing

Before making changes, return:

1. Proposed folder tree
2. Migration table
3. Risky dependencies
4. Safe refactor order
5. First small patch only

Do not rewrite the entire module at once.
