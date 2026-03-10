import sys
import subprocess

try:
    from rembg import remove
except ImportError:
    print("Installing requirements: rembg...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "rembg"])
    from rembg import remove

import os

input_path = r'c:\Users\Bijou\.gemini\antigravity\brain\c267d4d6-74fa-44b8-8861-adb5ae69b072\media__1772251136404.png'
output_path = r'c:\Users\Bijou\.gemini\Hames\Sales\SeoulYonsei.Admin\public\images\directors.png'

print("Removing background using rembg...")
try:
    with open(input_path, 'rb') as i:
        with open(output_path, 'wb') as o:
            input_data = i.read()
            output_data = remove(input_data)
            o.write(output_data)
    print(f"Background removed successfully. Saved to {output_path}")
except Exception as e:
    print(f"Error during background removal: {e}")
