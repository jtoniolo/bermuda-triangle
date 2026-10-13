# Issue tracker: GitHub

The issues and specs for this repo are GitHub issues. Use the `gh` CLI for all operations.

## Commands

- To create an issue, run `gh issue create --title "..." --body "..."`. For a body with more than one line, use a heredoc.
- To read an issue, run `gh issue view <number> --comments`. Use `jq` to filter the comments. Also get the labels.
- To list issues, run `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`. Add the necessary `--label` and `--state` filters.
- To add a comment to an issue, run `gh issue comment <number> --body "..."`.
- To add a label, run `gh issue edit <number> --add-label "..."`. To remove a label, use `--remove-label "..."`.
- To close an issue, run `gh issue close <number> --comment "..."`.

The `gh` CLI gets the repo from `git remote -v` when you run it in a clone.

## Pull requests in triage

**PRs as a request surface: no.** _(Set this flag to `yes` if this repo uses external PRs as feature requests. The `/triage` skill reads this flag.)_

If the flag is `yes`, PRs use the same labels and states as issues. Use the `gh pr` commands:

- To read a PR, run `gh pr view <number> --comments`. To get the diff, run `gh pr diff <number>`.
- To list external PRs for triage, run `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`. Keep only the PRs where `authorAssociation` is `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`. Remove the PRs where it is `OWNER`, `MEMBER`, or `COLLABORATOR`.
- To add a comment, change labels, or close a PR, use `gh pr comment`, `gh pr edit --add-label` or `--remove-label`, and `gh pr close`.

Issues and PRs in GitHub use the same number sequence. Thus, `#42` can be an issue or a PR. First, run `gh pr view 42`. If that command fails, run `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinder operations

The `/wayfinder` skill uses these operations. The **map** is one issue. The tickets are **child** issues of the map.

- **Map**: The map is one issue with the label `wayfinder:map`. Its body has the sections Notes, Decisions-so-far, and Fog. To create it, run `gh issue create --label wayfinder:map`.
- **Child ticket**: A child ticket is an issue that links to the map as a GitHub sub-issue. To link it, use `gh api` on the sub-issues endpoint. If sub-issues are not available, add the child to a task list in the map body. Then put `Part of #<map>` at the top of the child body. The labels are `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, and `wayfinder:task`. When a developer claims a ticket, assign the ticket to that developer.
- **Blocking**: Use the GitHub native issue dependencies. To add a dependency, run `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. The `<blocker-db-id>` value is the numeric database ID of the blocker. To get it, run `gh api repos/<owner>/<repo>/issues/<n> --jq .id`. Do not use the `#number` or the `node_id`. The field `issue_dependencies_summary.blocked_by` shows only the open blockers. If dependencies are not available, put a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when all of its blockers are closed.
- **Frontier query**: The frontier is the set of tickets that an agent can start now. List the open children of the map with `gh issue list --state open`. Use the sub-issues or the task list of the map to find the children. Remove each child that has an open blocker or an assignee. A child has an open blocker if `issue_dependencies_summary.blocked_by` is more than 0, or if its `Blocked by` line names an open issue. The first child in map order is the next ticket.
- **Claim**: Run `gh issue edit <n> --add-assignee @me`. This command is the first write of the session.
- **Resolve**: Run `gh issue comment <n> --body "<answer>"`. Then run `gh issue close <n>`. Then add a summary and a link to the Decisions-so-far section of the map.
