# Two-minute reviewer walkthrough

1. Run `npm ci && npm run dev`.
2. Choose **Try with sample data** to avoid using personal conversation history.
3. Continue and select **Let me review**.
4. Open the primary **Brain preview** action and move through all five formatted Markdown files. Follow a **Source** citation to its evidence excerpt, then switch back to **Brain files**.
5. Close with **Escape**; keyboard focus returns to the action that opened the inspector. The **Evidence** action is also available directly on each Agent.
6. Open an Agent's **•••** menu and choose **Rename**. Press Enter to save or Escape to cancel. Dismiss two Agents, then use **Undo** twice to restore both. You can also merge two suggestions; other dismissed Agents remain recoverable. The menu supports Enter, arrow keys, Home, End, and Escape.
7. Check the Agent/file/source counts, choose **Review folders**, inspect the destination and exact file manifest, then create the folders. For a disposable walkthrough, use **Change destination** to choose an empty test folder.
8. Use **Reveal in Finder** to inspect the generated Markdown.

The automatic path follows the same trust boundaries but removes the rename, dismiss, and merge decisions.

Sample analysis and merging always run locally. To evaluate the OpenAI pipeline with synthetic data, use the opt-in live tests documented in the README. To inspect the compiled desktop app, run `npm run build && npm run preview`.

For the final review, resize the app to its minimum supported window size, navigate the review menus and inspector by keyboard, and confirm that the **Import → Setup → Analyze → Review → Create** indicator follows the flow. Source excerpts are review aids; inspect generated claims before keeping them.
