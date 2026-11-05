package expo.modules.unreelblocker.detection

/** Hand-built accessibility trees for detection tests, mirroring what the apps expose. */
internal class FakeNode(
  override val viewId: String?,
  override val label: String?,
  override val isSelected: Boolean,
  override val isVisibleToUser: Boolean,
  override val isClickable: Boolean,
  private val children: List<FakeNode>,
) : UiNode {
  override var parent: UiNode? = null
  override val childCount: Int get() = children.size
  override fun child(index: Int): UiNode? = children.getOrNull(index)
  override fun click(): Boolean = isClickable

  init {
    children.forEach { it.parent = this }
  }

  fun flatten(): List<FakeNode> = listOf(this) + children.flatMap { it.flatten() }
}

internal fun node(
  id: String? = null,
  label: String? = null,
  selected: Boolean = false,
  visible: Boolean = true,
  clickable: Boolean = false,
  children: List<FakeNode> = emptyList(),
) = FakeNode(id, label, selected, visible, clickable, children)

internal class FakeTree(vararg roots: FakeNode) : UiTree {
  private val nodes = roots.flatMap { it.flatten() }
  override fun findByViewId(viewId: String) = nodes.filter { it.viewId == viewId }
  override fun findByText(text: String) =
    nodes.filter { it.label?.contains(text, ignoreCase = true) == true }
}
