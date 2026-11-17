import Cocoa

/// Painel lateral translúcido que mostra o texto reconhecido na área selecionada.
final class TextPanelView: SolidEffectView, NSTextViewDelegate {
    var onCopy: ((String) -> Void)?
    var onClose: (() -> Void)?

    private let textView: NSTextView
    private let scrollView: NSScrollView
    private let spinner = NSProgressIndicator()
    private let statusLabel = NSTextField(labelWithString: "Reconhecendo texto…")
    private let copyButton = AccentButton(title: "Copiar tudo", tip: "Copiar todo o texto e fechar", width: 124)
    private let copySelectionButton = SecondaryButton(title: "Copiar seleção",
                                                      tip: "Copiar só o trecho selecionado (⌘C)", width: 124)

    init() {
        scrollView = NSTextView.scrollableTextView()
        textView = scrollView.documentView as! NSTextView
        super.init(frame: .zero)

        material = .hudWindow
        blendingMode = .behindWindow
        state = .active
        appearance = NSAppearance(named: .darkAqua)
        maskImage = Icons.roundedMask(radius: 14)
        let fill = DarkFillView(radius: 14)
        fill.frame = bounds
        addSubview(fill)

        let title = NSTextField(labelWithString: "Texto reconhecido")
        title.font = NSFont.systemFont(ofSize: 15, weight: .semibold)
        title.textColor = .labelColor

        let close = IconButton(image: Icons.close, tip: "Fechar painel")
        close.onClick = { [weak self] in self?.onClose?() }

        let header = NSStackView(views: [title, NSView(), close])
        header.orientation = .horizontal
        header.alignment = .centerY

        let subtitle = NSTextField(labelWithString: "Edite se quiser. Selecione um trecho para copiar só ele.")
        subtitle.font = NSFont.systemFont(ofSize: 11)
        subtitle.textColor = .secondaryLabelColor

        textView.isEditable = true
        textView.isRichText = false
        textView.allowsUndo = true
        textView.drawsBackground = false
        textView.font = NSFont.systemFont(ofSize: 14)
        textView.textColor = .labelColor
        textView.insertionPointColor = .controlAccentColor
        textView.textContainerInset = NSSize(width: 6, height: 8)
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.isHidden = true

        let card = CardView()
        card.translatesAutoresizingMaskIntoConstraints = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(scrollView)

        spinner.style = .spinning
        spinner.controlSize = .small
        spinner.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.font = NSFont.systemFont(ofSize: 13)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.alignment = .center
        statusLabel.lineBreakMode = .byWordWrapping
        statusLabel.maximumNumberOfLines = 0
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(spinner)
        card.addSubview(statusLabel)

        copyButton.onClick = { [weak self] in
            guard let self = self else { return }
            self.onCopy?(self.textView.string)
        }
        copyButton.isHidden = true
        copySelectionButton.onClick = { [weak self] in
            guard let self = self else { return }
            let range = self.textView.selectedRange()
            guard range.length > 0 else { return }
            self.onCopy?((self.textView.string as NSString).substring(with: range))
        }
        copySelectionButton.isEnabled = false
        copySelectionButton.isHidden = true
        textView.delegate = self

        let footer = NSStackView(views: [NSView(), copySelectionButton, copyButton])
        footer.orientation = .horizontal

        let root = NSStackView(views: [header, subtitle, card, footer])
        root.orientation = .vertical
        root.alignment = .leading
        root.spacing = 10
        root.translatesAutoresizingMaskIntoConstraints = false
        root.setCustomSpacing(4, after: header)
        addSubview(root)

        NSLayoutConstraint.activate([
            root.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            root.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
            root.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            root.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            header.widthAnchor.constraint(equalTo: root.widthAnchor),
            card.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -4),
            footer.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -4),
            copyButton.widthAnchor.constraint(equalToConstant: 124),
            copySelectionButton.widthAnchor.constraint(equalToConstant: 124),
            copySelectionButton.heightAnchor.constraint(equalToConstant: 30),
            copyButton.heightAnchor.constraint(equalToConstant: 30),

            scrollView.topAnchor.constraint(equalTo: card.topAnchor, constant: 2),
            scrollView.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -2),
            scrollView.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 2),
            scrollView.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -2),

            spinner.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: card.centerYAnchor, constant: -14),
            statusLabel.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 10),
            statusLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            statusLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
        ])
        card.setContentHuggingPriority(.defaultLow, for: .vertical)
        card.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        spinner.startAnimation(nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    func showLoading() {
        scrollView.isHidden = true
        copyButton.isHidden = true
        copySelectionButton.isHidden = true
        spinner.isHidden = false
        spinner.startAnimation(nil)
        statusLabel.stringValue = "Reconhecendo texto…"
        statusLabel.isHidden = false
    }

    func show(_ outcome: OCR.Outcome) {
        spinner.stopAnimation(nil)
        spinner.isHidden = true
        switch outcome {
        case .text(let text) where !text.isEmpty:
            statusLabel.isHidden = true
            scrollView.isHidden = false
            copyButton.isHidden = false
            copySelectionButton.isHidden = false
            copySelectionButton.isEnabled = false
            textView.string = text
            textView.setSelectedRange(NSRange(location: 0, length: 0))
            textView.scrollRangeToVisible(NSRange(location: 0, length: 0))
            window?.makeFirstResponder(textView)
        case .text:
            statusLabel.stringValue = "Nenhum texto encontrado nesta área."
            statusLabel.isHidden = false
        case .failure(let message):
            statusLabel.stringValue = message
            statusLabel.isHidden = false
        }
    }

    func textViewDidChangeSelection(_ notification: Notification) {
        copySelectionButton.isEnabled = textView.selectedRange().length > 0
    }
}
