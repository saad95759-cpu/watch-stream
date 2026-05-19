$content = Get-Content -Path "public\index.html" -Encoding UTF8
$emojis = @("❤️", "😂", "😮", "👏", "🔥", "💀")
$emojiIndex = 0
for ($i=0; $i -lt $content.Length; $i++) {
    if ($content[$i] -match 'class="reaction-btn"') {
        if ($emojiIndex -lt $emojis.Length) {
            $e = $emojis[$emojiIndex]
            $content[$i] = "                <button class=`"reaction-btn`" data-emoji=`"$e`">$e</button>"
            $emojiIndex++
        }
    }
}
$content | Set-Content -Path "public\index.html" -Encoding UTF8
