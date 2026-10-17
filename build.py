# Builds public/index.html from the shared app file (../winter-arc.html is the Claude-artifact source).
import sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text()
head = pathlib.Path('head.html').read_text()
i = src.index('</style>') + len('</style>')
pathlib.Path('public/index.html').write_text(head + src[:i] + '\n</head>\n<body>\n' + src[i:] + '\n</body>\n</html>\n')
