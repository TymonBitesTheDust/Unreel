package expo.modules.unreelblocker.data

import java.util.concurrent.CopyOnWriteArraySet

/** One intervention, as reported to the dashboard. */
data class BlockEvent(
  val app: String,
  val feature: String,
  /**
   * "tab" (opened the feed tab), "player" (full-screen player, shared allowance off),
   * "swipe" (swiped past a shared one) or "limit" (stayed on a shared one too long).
   */
  val trigger: String,
  /** How we left the feed: "exitTab" (clicked Home) or "back". */
  val method: String,
  val at: Long,
  val todayTotal: Int,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "app" to app,
    "feature" to feature,
    "trigger" to trigger,
    "method" to method,
    "at" to at.toDouble(),
    "todayTotal" to todayTotal,
  )
}

/**
 * In-process fan-out from the accessibility service to the Expo module. The service and the
 * React Native runtime share a process, so a plain listener set is enough — no broadcasts,
 * no IPC, and nothing to leak to other apps.
 */
object BlockEventBus {
  private val blockListeners = CopyOnWriteArraySet<(BlockEvent) -> Unit>()
  private val stateListeners = CopyOnWriteArraySet<(Boolean) -> Unit>()

  fun onBlocked(listener: (BlockEvent) -> Unit): () -> Unit {
    blockListeners += listener
    return { blockListeners -= listener }
  }

  fun onServiceState(listener: (Boolean) -> Unit): () -> Unit {
    stateListeners += listener
    return { stateListeners -= listener }
  }

  fun emitBlocked(event: BlockEvent) = blockListeners.forEach { runCatching { it(event) } }

  fun emitServiceState(running: Boolean) = stateListeners.forEach { runCatching { it(running) } }
}
